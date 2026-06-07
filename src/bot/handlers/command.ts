import { Context } from 'grammy';

export const startMessage = `Focus Bot is online. Send me anything — text, voice, photos, docs — and I'll save it as a note in your vault.

Type /help to see prefix symbols and commands.`;

export const helpMessage = `Prefix Symbols
Add these before your message to control where and how it's saved:

#project/name — route to Projects/{name}
+tag — add a tag (repeatable)
^type — set the note type
!status — override inbox status
>folder — route to a custom folder

Combine freely:
#project/focus +idea ^reflection !evergreen The thought

Commands
/start — Show welcome message
/help — Show this reference
/health — Bot health and uptime
/status — systemd service status
/logs — Recent log entries
/restart — Restart the bot`;

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(startMessage);
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(helpMessage);
}
