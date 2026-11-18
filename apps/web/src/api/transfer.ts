import type {
  ExportContents,
  ExportSelection,
  ImportChoices,
  ImportPreview,
  ImportSummary,
  TransferFile,
} from '@suptron/runtime/browser';
import { HttpError, request } from './client';

/** An Import the server could not write; it put the configuration back and says what failed (`500 import_failed`). */
export class ImportFailedError extends Error {
  override readonly name = 'ImportFailedError';
}

export const transferApi = {
  contents: () => request<ExportContents>('/api/export/contents'),
  export: (selection: ExportSelection) =>
    request<{ files: TransferFile[] }>('/api/export', { method: 'POST', body: selection }).then(
      (r) => r.files,
    ),
  preview: (files: readonly TransferFile[], choices: ImportChoices) =>
    request<ImportPreview>('/api/import/preview', { method: 'POST', body: { files, choices } }),
  async apply(files: readonly TransferFile[], choices: ImportChoices): Promise<ImportSummary> {
    try {
      return await request<ImportSummary>('/api/import/apply', {
        method: 'POST',
        body: { files, choices },
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 500) {
        const body = error.body as { reason?: string; message?: string } | undefined;
        if (body?.reason === 'import_failed') {
          throw new ImportFailedError(body.message ?? 'The Import failed', { cause: error });
        }
      }
      throw error;
    }
  },
};
