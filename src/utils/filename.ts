import * as fs from 'node:fs';
import * as path from 'node:path';
import sanitize from 'sanitize-filename';

/**
 * Generate a safe filename from a title.
 * Preserves spaces for Obsidian compatibility.
 */
function generateFilename(title: string): string {
  const sanitized = sanitize(title, { replacement: '-' });
  if (!sanitized) {
    return `note-${Date.now()}.md`;
  }
  return `${sanitized}.md`;
}

/**
 * Resolve a unique file path for a note.
 * If a file with the same name already exists, appends a timestamp to avoid overwriting.
 */
export function resolveFilePath(title: string, targetDir: string): string {
  const filename = generateFilename(title);
  const filePath = path.join(targetDir, filename);

  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  // Collision: append timestamp before .md extension
  const base = filename.slice(0, -3); // strip .md
  const uniqueFilename = `${base} ${Date.now()}.md`;
  return path.join(targetDir, uniqueFilename);
}
