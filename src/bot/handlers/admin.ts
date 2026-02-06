import { Context } from 'grammy';

async function runCommand(command: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([command, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  return stdout || stderr || 'No output';
}

function escapeMarkdown(text: string): string {
  // Escape special characters for MarkdownV2
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function truncate(text: string, maxLength: number = 4000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n... (truncated)';
}

export async function handleStatus(ctx: Context): Promise<void> {
  try {
    const output = await runCommand('systemctl', ['status', 'focus-bot', '--no-pager']);
    const escaped = escapeMarkdown(truncate(output));
    await ctx.reply(`\`\`\`\n${escaped}\n\`\`\``, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    await ctx.reply('Failed to get status');
  }
}

export async function handleLogs(ctx: Context): Promise<void> {
  try {
    const output = await runCommand('journalctl', ['-u', 'focus-bot', '-n', '30', '--no-pager']);
    const escaped = escapeMarkdown(truncate(output));
    await ctx.reply(`\`\`\`\n${escaped}\n\`\`\``, { parse_mode: 'MarkdownV2' });
  } catch (error) {
    await ctx.reply('Failed to get logs');
  }
}

export async function handleRestart(ctx: Context): Promise<void> {
  try {
    await ctx.reply('Restarting bot...');
    await runCommand('sudo', ['systemctl', 'restart', 'focus-bot.service']);
  } catch (error) {
    // Process will likely be killed before this runs
    await ctx.reply('Failed to restart');
  }
}

export async function handleHealth(ctx: Context): Promise<void> {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const memory = process.memoryUsage();
  const memMB = Math.round(memory.heapUsed / 1024 / 1024);

  await ctx.reply(
    `Bot is healthy\n\nUptime: ${hours}h ${minutes}m ${seconds}s\nMemory: ${memMB} MB`
  );
}
