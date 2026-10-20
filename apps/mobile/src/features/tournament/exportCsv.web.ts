/** Web build: downloads the CSV (the text already carries the UTF-8 BOM for Excel). */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
