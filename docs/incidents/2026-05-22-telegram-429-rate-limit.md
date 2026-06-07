# Incident: Telegram 429 Rate Limit Lockout

**Date:** 2026-05-22
**Severity:** High — bot completely unable to respond for ~8 hours
**Status:** Resolved (code fix shipped, deployment pending restart)

---

## Symptoms

- LaunchAgent showed `com.alpheus-bot` running (PID 41017, uptime 42h+)
- Heartbeat logs confirmed polling was active every 5 minutes
- User-facing behavior: bot received messages but sent nothing back
- User reported: "telegram bot not responding... AGAIN"

## Root Cause

`src/services/stream-writer.ts` in `full` and `balanced` streaming modes calls `editMessageText` to update a placeholder message as tokens arrive from the Claude Agent SDK.

The `full` mode had a 100ms debounce floor, which is **10 edits per second per chat** — far above Telegram's documented limit of **~1 message/edit per second per chat** (and 30/sec globally).

When the bot exceeded the limit, Telegram returned:

```
GrammyError: 429 Too Many Requests: retry after 29130
```

That's a **29,130 second (~8 hour) cooldown**. Because the retry handler in `command.ts` re-invoked `processMessage` without honoring `retry_after`, every retry hit the same wall and the cooldown extended further.

## Why It Took So Long to Notice

1. The bot kept logging healthy heartbeats — polling was active and the LaunchAgent KeepAlive thought everything was fine
2. The healthcheck only verified the process was alive, not that it could actually send messages
3. The 429 error was logged to `alpheus-bot.error.log` but no alerting was wired up

## Fix

Implemented in `src/services/telegram-rate-limit.ts` and applied in `stream-writer.ts`:

1. **Per-chat throttle**: minimum 1,100ms between any edit/send to the same chat. Token bucket per chat ID.
2. **Honor `retry_after`**: when Telegram returns 429, parse `parameters.retry_after`, wait that long, then try once more. Do NOT enter a retry loop.
3. **Default mode is now `balanced`** with a 2,500ms edit interval (was effectively `full` in many code paths). `full` mode is preserved but its floor is raised to 1,100ms.
4. **Drop "balanced timer + per-delta edit"**: only the balanced timer fires edits — the delta handler just accumulates text.
5. **Global rate**: simple sliding-window counter caps at 25 calls/sec across all chats (under Telegram's 30/sec global limit).

## Prevention

- **Shared utility**: `src/utils/telegram-rate-limit.ts` exports `throttledEdit()` and `throttledSend()`. All Telegram-bound code MUST use these wrappers, not raw `ctx.api.*` calls in hot loops.
- **Lint rule (informal, not enforced yet)**: any `setInterval`/`for await` loop that touches `ctx.api.*` must go through the throttle.
- **Health check enhancement** (future): healthcheck.sh should probe an `/api/getMe` call and verify a recent successful `sendMessage` — not just process liveness.
- **Alerting** (future): tail `alpheus-bot.error.log` for 429 codes, send notification to alternate channel (email, Slack) when rate-limit kicks in.

## Related Cleanup

While in here, also addressed:

- **EDEADLK errors** loading Google Drive context files (Matthew correspondence with `(1)`, `(2)` duplicates) — added to `.gitignore`-style skip list in context-loader.

## Files Changed

- `src/services/stream-writer.ts` — rewrote rate-limit-aware
- `src/utils/telegram-rate-limit.ts` — NEW shared throttle
- `src/services/context-loader.ts` — skip Drive sync duplicate suffixes

## Validation

- `bun run build` — clean
- Restart via `launchctl unload && launchctl load` — verified heartbeat resumes
- Manual smoke test — send long prompt, observe ≤1 edit/sec in network log

## References

- Telegram Bots FAQ: ["How can I message all of my bot's subscribers at once?"](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this) — documents the 1/sec per-chat and 30/sec global limits
- grammY rate limit handling: https://grammy.dev/plugins/runner#options
