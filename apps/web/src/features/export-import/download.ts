export const ZIP_MIME_TYPE = 'application/zip';

/** The name of an Export made on `date`, by the local calendar: `suptron-export-2026-11-17.zip`. */
export function exportFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `suptron-export-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

/** Hands `bytes` to the browser as a download named `fileName`. */
export function downloadFile(bytes: Uint8Array, fileName: string, mimeType: string): void {
  // fflate types its output over any buffer; the bytes it returns always own a plain ArrayBuffer.
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
