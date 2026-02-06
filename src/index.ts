import { run } from '@grammyjs/runner';
import * as fs from 'node:fs';
import { createBot } from './bot/bot.js';
import { CAPTURES_DIR } from './config.js';

async function main(): Promise<void> {
  // Ensure Captures/ directory exists before bot starts
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  console.log(`Captures directory ready: ${CAPTURES_DIR}`);

  const bot = createBot();

  // Register command menu with Telegram
  await bot.api.setMyCommands([
    { command: 'start', description: 'Show help message' },
    { command: 'health', description: 'Check bot health and uptime' },
    { command: 'status', description: 'Show systemd service status' },
    { command: 'logs', description: 'Show recent log entries' },
  ]);

  const handle = run(bot);

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
