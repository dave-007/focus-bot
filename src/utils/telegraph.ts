import TelegraphModule from 'telegra.ph';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

// Local types — the telegra.ph package typings don't work with NodeNext resolution
type TelegraphTag = 'a' | 'aside' | 'b' | 'blockquote' | 'br' | 'code' | 'em' |
  'figcaption' | 'figure' | 'h3' | 'h4' | 'hr' | 'i' | 'iframe' | 'img' |
  'li' | 'ol' | 'p' | 'pre' | 's' | 'strong' | 'u' | 'ul' | 'video';

type TelegraphNode = string | {
  tag: TelegraphTag;
  attrs?: { href?: string; src?: string };
  children?: TelegraphNode[];
};

interface TelegraphClient {
  token: string;
  createAccount(shortName: string, name?: string, url?: string): Promise<{
    access_token?: string;
    auth_url?: string;
    short_name: string;
  }>;
  createPage(title: string, content: TelegraphNode[], authorName?: string, authorUrl?: string, returnContent?: boolean): Promise<{
    path: string;
    url: string;
    title: string;
  }>;
}

const Telegraph = TelegraphModule as unknown as new (token: string) => TelegraphClient;

// Zod schema for persisted Telegraph account
const telegraphAccountSchema = z.object({
  access_token: z.string().min(1),
  auth_url: z.string().url(),
  short_name: z.string(),
});

// Telegraph client singleton
let telegraphClient: TelegraphClient | null = null;

const ACCOUNT_FILE = path.join(process.cwd(), '.telegraph-account.json');

/**
 * Initialize Telegraph account (creates one if needed).
 * Persists credentials to .telegraph-account.json for reuse across restarts.
 */
export async function initTelegraph(): Promise<void> {
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf-8'));
      } catch {
        console.warn('[telegraph] Malformed account file, creating new account');
        raw = null;
      }
      const result = raw ? telegraphAccountSchema.safeParse(raw) : { success: false as const };

      if (result.success) {
        telegraphClient = new Telegraph(result.data.access_token);
        console.log('[telegraph] Loaded existing account');
        return;
      }
      console.warn('[telegraph] Invalid account file, creating new account');
    }

    // Create new account
    telegraphClient = new Telegraph('');
    const account = await telegraphClient.createAccount(
      'FocusBot',
      'Focus Bot',
      'https://github.com'
    );

    telegraphClient.token = account.access_token!;

    fs.writeFileSync(
      ACCOUNT_FILE,
      JSON.stringify({
        access_token: account.access_token,
        auth_url: account.auth_url,
        short_name: account.short_name,
      }, null, 2),
      { mode: 0o600 }
    );
    console.log('[telegraph] Created new account');
  } catch (error) {
    console.error('[telegraph] Failed to initialize:', error);
  }
}

/**
 * Convert plain-text summary (paragraphs + bullet points) to Telegraph Node format.
 * Our AI summaries use only paragraphs and `- ` bullet points (no markdown headers or bold).
 */
function summaryToNodes(text: string): TelegraphNode[] {
  const nodes: TelegraphNode[] = [];
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    let currentList: TelegraphNode[] = [];

    for (const line of lines) {
      if (line.startsWith('- ')) {
        currentList.push({ tag: 'li', children: [line.slice(2).trim()] });
      } else {
        // Flush any pending list items
        if (currentList.length > 0) {
          nodes.push({ tag: 'ul', children: currentList });
          currentList = [];
        }
        if (line.trim()) {
          nodes.push({ tag: 'p', children: [line.trim()] });
        }
      }
    }

    // Flush remaining list items
    if (currentList.length > 0) {
      nodes.push({ tag: 'ul', children: currentList });
    }
  }

  return nodes;
}

/**
 * Create a Telegraph page from a summary.
 * Returns the page URL, or null on failure.
 */
export async function createTelegraphPage(
  title: string,
  summary: string,
  sourceUrl?: string
): Promise<string | null> {
  if (!telegraphClient) {
    await initTelegraph();
  }

  if (!telegraphClient) {
    console.error('[telegraph] Client not initialized');
    return null;
  }

  try {
    const nodes = summaryToNodes(summary);

    // Prepend source link
    if (sourceUrl) {
      nodes.unshift({
        tag: 'p',
        children: [{ tag: 'a', attrs: { href: sourceUrl }, children: ['Original source'] }],
      });
    }

    if (nodes.length === 0) {
      console.warn('[telegraph] No content to publish');
      return null;
    }

    const page = await telegraphClient.createPage(
      title.slice(0, 256),
      nodes,
      'Focus Bot',
      undefined,
      false
    );

    return page.url;
  } catch (error) {
    console.error('[telegraph] Failed to create page:', error);
    return null;
  }
}

// Initialize on module load
initTelegraph().catch(console.error);
