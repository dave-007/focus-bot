import * as fs from 'node:fs';
import { run } from '@grammyjs/runner';
import { createBot } from './bot/bot.js';
import { config, BOOKMARKS_DIR } from './config.js';
import { helpMessage } from './bot/handlers/command.js';

async function main(): Promise<void> {
  // Ensure Bookmarks directory exists for URL-based notes
  if (!fs.existsSync(BOOKMARKS_DIR)) {
    fs.mkdirSync(BOOKMARKS_DIR);
    console.log(`Created Bookmarks directory: ${BOOKMARKS_DIR}`);
  }

  const bot = createBot();

  // Register command menu with Telegram
  await bot.api.setMyCommands([
    { command: 'start', description: 'Show help message' },
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
    bot.api.sendMessage(userId, helpMessage).catch(() => {
      // Ignore errors (user may not have started a chat yet)
    });
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
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
