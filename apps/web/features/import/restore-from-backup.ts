import { unzipSync } from 'fflate';
import { api } from '@/lib/api';

/**
 * Downloads a backup zip (`memoire.json` + `attachments/`, §31) and pulls
 * just `memoire.json` out of it client-side, handed to `ImportDialog` as a
 * `memoire-json`-kind `File` — no new backend restore endpoint needed
 * beyond what the import pipeline (§30A) already built.
 */
export async function fetchBackupAsMemoireJsonFile(filename: string): Promise<File> {
  const response = await fetch(api.backupDownloadUrl(filename));
  if (!response.ok) throw new Error(`Could not download backup (${response.status})`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  const entries = unzipSync(buffer, { filter: (file) => file.name === 'memoire.json' });
  const memoireJson = entries['memoire.json'];
  if (!memoireJson) throw new Error('Backup did not contain a memoire.json');
  return new File([memoireJson], 'memoire.json', { type: 'application/json' });
}
