import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { run } from '@grammyjs/runner';
import { createBot } from './bot/bot.js';
import { config, BOOKMARKS_DIR } from './config.js';
import { startMessage } from './bot/handlers/command.js';
import { seedPrompts } from './services/prompts.js';
import { ensureFilesDir } from './bot/handlers/document.js';

function killOtherInstances(): void {
  // Find all bun processes running src/index.ts (excluding ourselves)
  try {
    const output = execSync(`pgrep -f "bun.*src/index" || true`, { encoding: 'utf-8' });
    const pids = output.trim().split('\n')
      .map((p) => parseInt(p, 10))
      .filter((p) => !isNaN(p) && p !== process.pid && p !== process.ppid);

    for (const pid of pids) {
      console.error(`Killing previous bot instance (PID ${pid})`);
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    // Give them a moment to die gracefully, then force-kill any survivors
    if (pids.length > 0) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const alive = pids.filter((pid) => {
          try { process.kill(pid, 0); return true; } catch { return false; }
        });
        if (alive.length === 0) break;
      }
      for (const pid of pids) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
    }
  } catch (error) {
    console.error('Failed to check for other instances:', error);
  }
}

function acquireLock(lockPath: string): void {
  killOtherInstances();
  fs.writeFileSync(lockPath, String(process.pid), 'utf-8');
}

async function main(): Promise<void> {
  // Acquire lock to prevent concurrent bot instances
  const lockPath = `${config.NOTES_DIR}/.focus-bot.lock`;
  acquireLock(lockPath);

  // Ensure Bookmarks directory exists for URL-based notes
  if (!fs.existsSync(BOOKMARKS_DIR)) {
    fs.mkdirSync(BOOKMARKS_DIR);
    console.log(`Created Bookmarks directory: ${BOOKMARKS_DIR}`);
  }

  // Ensure Files directory exists for document attachments
  ensureFilesDir();

  // Seed user-configurable prompt files (no-op if PROMPTS_DIR is not set)
  seedPrompts();

  const bot = createBot();

  // Register command menu with Telegram
  await bot.api.setMyCommands([
    { command: 'start', description: 'Welcome message' },
    { command: 'help', description: 'Prefix symbols and commands' },
    { command: 'health', description: 'Check bot health and uptime' },
    { command: 'status', description: 'Show systemd service status' },
    { command: 'logs', description: 'Show recent log entries' },
    { command: 'restart', description: 'Restart the bot' },
  ]);

  const handle = run(bot, {
    runner: {
      fetch: {
        allowed_updates: ['message', 'message_reaction'],
      },
    },
  });

  // Notify allowed users that the bot is online
  for (const userId of config.ALLOWED_USER_IDS) {
    bot.api.sendMessage(userId, startMessage).catch(() => {
      // Ignore errors (user may not have started a chat yet)
    });
  }

  // Write heartbeat file every 60s so a watchdog can detect staleness.
  // Also self-check: if the lock file no longer points to us, a newer
  // instance has taken over — exit so we don't fight for Telegram updates.
  const heartbeatPath = `${config.NOTES_DIR}/.focus-bot-heartbeat`;
  const writeHeartbeat = () => {
    try {
      const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
      if (!isNaN(lockPid) && lockPid !== process.pid) {
        console.error(`Lock file owned by PID ${lockPid}, not us (${process.pid}). Exiting to avoid concurrent polling.`);
        process.exit(0);
      }
    } catch {
      // Lock file missing — restore it
      fs.writeFileSync(lockPath, String(process.pid), 'utf-8');
    }
    fs.writeFileSync(heartbeatPath, new Date().toISOString(), 'utf-8');
  };
  writeHeartbeat();
  const heartbeatInterval = setInterval(writeHeartbeat, 60_000);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    clearInterval(heartbeatInterval);
    try { fs.unlinkSync(heartbeatPath); } catch {}
    try {
      // Only delete the lock if it's still ours
      const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
      if (lockPid === process.pid) fs.unlinkSync(lockPath);
    } catch {}
    await handle.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('Bot is running...');
  await handle.task();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
