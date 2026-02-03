import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

loadEnv();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1, 'TELEGRAM_BOT_TOKEN is required'),

  ALLOWED_USER_IDS: z
    .string()
    .min(1, 'ALLOWED_USER_IDS is required')
    .transform((val) =>
      val.split(',').map((id) => parseInt(id.trim(), 10))
    )
    .refine(
      (ids) => ids.every((id) => !isNaN(id) && id > 0),
      'ALLOWED_USER_IDS must be comma-separated positive integers'
    ),

  NOTES_DIR: z
    .string()
    .min(1, 'NOTES_DIR is required')
    .refine(
      (val) => path.isAbsolute(val),
      'NOTES_DIR must be an absolute path'
    )
    .refine(
      (val) => fs.existsSync(val),
      'NOTES_DIR path does not exist'
    )
    .refine(
      (val) => fs.existsSync(val) && fs.statSync(val).isDirectory(),
      'NOTES_DIR must be a directory'
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuration error:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
