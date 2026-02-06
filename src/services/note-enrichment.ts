/**
 * Async note enrichment service (stub).
 *
 * Called after the fast capture path completes.
 * Future enrichment tasks: type classification, link suggestions,
 * summary generation, related notes discovery.
 */

/**
 * Process a captured note for enrichment.
 * Currently a no-op stub that logs the intent.
 *
 * @param filePath - Absolute path to the captured note file
 */
export async function processNote(filePath: string): Promise<void> {
  console.log(`[enrichment] Queued for future processing: ${filePath}`);
}
