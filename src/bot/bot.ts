import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from '../config.js';
import { authMiddleware } from './middleware/auth.js';
import { handleStart, handleHelp } from './handlers/command.js';
import { handleTextMessage } from './handlers/message.js';
import { handleVoiceMessage, handleReaction } from './handlers/voice.js';
import { handleDocumentMessage, handlePhotoMessage } from './handlers/document.js';
import { handleVideoMessage, handleAnimationMessage } from './handlers/video.js';
import { handleStatus, handleLogs, handleHealth, handleRestart } from './handlers/admin.js';

export function createBot(): Bot {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  // Configure auto-retry for API calls
  bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 60 }));

  // Middleware: auth MUST be first
  bot.use(authMiddleware);

  // Commands
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('status', handleStatus);
  bot.command('logs', handleLogs);
  bot.command('health', handleHealth);
  bot.command('restart', handleRestart);

  // Message handlers
  bot.on('message:text', handleTextMessage);
  bot.on('message:voice', handleVoiceMessage);
  bot.on('message:document', handleDocumentMessage);
  bot.on('message:photo', handlePhotoMessage);
  bot.on('message:video', handleVideoMessage);
  bot.on('message:animation', handleAnimationMessage);
  bot.on('message_reaction', handleReaction);

  // Error handler
  bot.catch((err) => {
    console.error(`Error processing update ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
