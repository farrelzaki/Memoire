'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { exportWorkspaceZip } from '@/features/export/workspace-export';
import { ImportDialog } from '@/features/import/import-dialog';
import { fetchBackupAsMemoireJsonFile } from '@/features/import/restore-from-backup';

/**
 * Home for this sprint's three import/export/backup actions (§30, §31,
 * Sprint 24) — deliberately not a general preferences page (no theme/
 * notification toggles here, see `docs/50-portability.md`).
 */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const { data: backups = [], isLoading: backupsLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: api.listBackups,
  });

  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: api.getWorkspace });
  const retentionDays = (workspace?.settings.versionRetentionDays as number | null | undefined) ?? 30;

  const updateRetention = useMutation({
    mutationFn: (versionRetentionDays: number | null) => api.updateWorkspaceSettings({ versionRetentionDays }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
  });

  const runBackup = useMutation({
    mutationFn: api.runBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });

  const handleExportWorkspace = async () => {
    setExporting(true);
    try {
      await exportWorkspaceZip();
    } finally {
      setExporting(false);
    }
  };

  const handleRestore = async (filename: string) => {
    const file = await fetchBackupAsMemoireJsonFile(filename);
    setRestoreFile(file);
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Export
        </h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Download every page as Markdown, every database as CSV, plus a lossless{' '}
          <code>memoire.json</code> — all in one .zip.
        </p>
        <button
          onClick={() => void handleExportWorkspace()}
          disabled={exporting}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {exporting ? 'Exporting…' : 'Export workspace'}
        </button>
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Backups
        </h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          A daily automatic backup keeps the last 7. You can also create one manually.
        </p>
        <button
          onClick={() => runBackup.mutate()}
          disabled={runBackup.isPending}
          className="mb-3 rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          {runBackup.isPending ? 'Backing up…' : 'Create backup now'}
        </button>

        {backupsLoading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-zinc-400">No backups yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {backups.map((b) => (
              <li key={b.filename} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <p className="text-zinc-700 dark:text-zinc-200">{new Date(b.createdAt).toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">{(b.size / 1024).toFixed(0)} KB</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={api.backupDownloadUrl(b.filename)}
                    className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => void handleRestore(b.filename)}
                    className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Version history
        </h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          How long automatic snapshots are kept (§33A). Manual saves and restore checkpoints are
          never removed.
        </p>
        <select
          value={retentionDays === null ? 'forever' : String(retentionDays)}
          onChange={(e) => updateRetention.mutate(e.target.value === 'forever' ? null : Number(e.target.value))}
          className="rounded border border-zinc-200 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">365 days</option>
          <option value="forever">Keep forever</option>
        </select>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Import
        </h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Import a Markdown file (or a .zip of Markdown files) or restore a memoire.json export.
        </p>
        <button
          onClick={() => setImportOpen(true)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
        >
          Import…
        </button>
      </section>

      {importOpen && <ImportDialog open onClose={() => setImportOpen(false)} />}
      {restoreFile && (
        <ImportDialog
          open
          onClose={() => setRestoreFile(null)}
          initialFile={restoreFile}
          initialKind="memoire-json"
        />
      )}
    </div>
  );
}
