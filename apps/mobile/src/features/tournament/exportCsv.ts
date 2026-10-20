import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/**
 * Writes a CSV to the cache directory and opens the share sheet. The text already carries the
 * UTF-8 BOM (see standings.ts) so Excel shows Arabic names correctly.
 */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  const file = new File(Paths.cache, fileName)
  if (file.exists) file.delete()
  file.create()
  await file.write(csv)
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: fileName })
}
