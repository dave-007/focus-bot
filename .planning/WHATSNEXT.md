# What's Next

## Current State

All planned features are delivered (Phases 1-6). The bot captures text notes, URL bookmarks, and voice notes with AI-generated metadata, publishes readable summaries to Telegraph, and saves everything to an Obsidian vault. Voice notes support multi-turn drafting with in-place message editing and reaction-based save.

## Recently Completed

**Phase 6: Voice Notes** (2026-02-11, PR #1)
- Groq Whisper transcription of voice messages
- Multi-turn drafting with follow-up voice/text editing
- Formatted draft preview (bold title, italic tags)
- Save via 👍 reaction or voice/text command
- `GROQ_API_KEY` required config, `message_reaction` runner support

## Future Ideas

Features to consider based on usage:

- **Review commands** -- `/inbox` to list unprocessed notes, `/review` for guided processing
- **Image capture** -- Save images with AI-generated descriptions
- **Multi-URL handling** -- Better support for messages with multiple links
- **Vault search** -- Search existing notes from Telegram

See `.planning/research/IMPROVEMENT-OPTIONS-REPORT.md` for the full prioritized feature list.
