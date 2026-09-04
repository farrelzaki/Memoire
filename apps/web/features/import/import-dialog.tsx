'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';

type Kind = 'markdown' | 'memoire-json' | 'csv' | 'notion-zip';
type Step = 'pick' | 'preview';

const CSV_COLUMN_TYPES = ['text', 'number', 'date', 'checkbox'] as const;

interface CsvColumn {
  name: string;
  type: string;
}

/**
 * Two-step import dialog (§30A.2, Sprint 24/24B): pick a file + format,
 * preview the parsed summary, then confirm or cancel. For `kind === 'csv'`,
 * the preview step also shows an editable per-column type table (§30A.1 —
 * guessed types are shown for correction before import, not applied
 * blindly) — column 0 (title) is always locked. `initialFile` lets the
 * "Restore from backup" flow (§31) hand this dialog an already-unzipped
 * `memoire.json` `File` and skip straight to the file-picked state.
 */
export function ImportDialog({
  open,
  onClose,
  initialFile,
  initialKind = 'markdown',
}: {
  open: boolean;
  onClose: () => void;
  initialFile?: File;
  initialKind?: Kind;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>(initialKind);
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<string[]>([]);

  const reset = () => {
    setStep('pick');
    setFile(null);
    setBusy(false);
    setError(null);
    setStagingId(null);
    setSummary(null);
    setWarnings([]);
    setColumnTypes([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePreview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.previewImport(file, kind);
      setStagingId(result.stagingId);
      setSummary(result.summary);
      setWarnings(result.warnings);
      if (kind === 'csv') {
        const columns = (result.summary.columns as CsvColumn[] | undefined) ?? [];
        setColumnTypes(columns.map((c) => c.type));
      }
      setStep('preview');
    } catch {
      setError('Could not read this file — check the format and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!stagingId) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'csv') {
        const columns = (summary?.columns as CsvColumn[] | undefined) ?? [];
        const overrides: Record<number, string> = {};
        columns.forEach((c, i) => {
          if (i > 0 && columnTypes[i] !== c.type) overrides[i] = columnTypes[i];
        });
        if (Object.keys(overrides).length > 0) {
          await api.updateImportColumnTypes(stagingId, overrides);
        }
      }
      const result = await api.confirmImport(stagingId);
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      handleClose();
      router.push(`/${result.importParentPageId}`);
    } catch {
      setError('Import failed partway through — nothing was written (one transaction).');
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (stagingId) await api.cancelImport(stagingId).catch(() => {});
    handleClose();
  };

  const csvColumns = kind === 'csv' ? ((summary?.columns as CsvColumn[] | undefined) ?? []) : [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? 'Choose a Markdown file (or a .zip of Markdown files), a CSV to become a database, a Notion export .zip, or a memoire.json export to restore.'
              : 'Review what will be imported before confirming.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'pick' && (
          <div className="space-y-3">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={kind === 'markdown'} onChange={() => setKind('markdown')} />
                Markdown
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={kind === 'csv'} onChange={() => setKind('csv')} />
                CSV
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={kind === 'notion-zip'} onChange={() => setKind('notion-zip')} />
                Notion export .zip
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={kind === 'memoire-json'}
                  onChange={() => setKind('memoire-json')}
                />
                memoire.json restore
              </label>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={
                kind === 'markdown'
                  ? '.md,.zip'
                  : kind === 'notion-zip'
                    ? '.zip'
                    : kind === 'csv'
                      ? '.csv'
                      : '.json'
              }
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-600 dark:text-zinc-300"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}

        {step === 'preview' && summary && (
          <div className="space-y-3 text-sm">
            {kind === 'csv' ? (
              <>
                <p className="text-zinc-700 dark:text-zinc-300">
                  {String(summary.rowCount)} rows in <strong>{String(summary.databaseName)}</strong>.
                  Will be created under: <strong>{String(summary.importParentTitle)}</strong>
                </p>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 dark:text-zinc-400">
                      <th className="py-1">Column</th>
                      <th className="py-1">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvColumns.map((column, i) => (
                      <tr key={column.name} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1.5 pr-2 text-zinc-700 dark:text-zinc-300">{column.name}</td>
                        <td className="py-1.5">
                          {i === 0 ? (
                            <span className="text-zinc-400">title (fixed)</span>
                          ) : (
                            <select
                              value={columnTypes[i]}
                              onChange={(e) => {
                                const next = [...columnTypes];
                                next[i] = e.target.value;
                                setColumnTypes(next);
                              }}
                              className="rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
                            >
                              {CSV_COLUMN_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-zinc-700 dark:text-zinc-300">
                {String(summary.pageCount)} pages
                {kind === 'notion-zip' ? `, ${String(summary.databaseCount)} databases` : ''},{' '}
                {String(summary.imageCount)} images. Will be created under:{' '}
                <strong>{String(summary.importParentTitle)}</strong>
              </p>
            )}
            {warnings.length > 0 && (
              <ul className="list-inside list-disc text-amber-600 dark:text-amber-400">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {error && <p className="text-red-500">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          {step === 'pick' ? (
            <button
              type="button"
              disabled={!file || busy}
              onClick={() => void handlePreview()}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? 'Reading…' : 'Preview'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? 'Importing…' : 'Confirm'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
