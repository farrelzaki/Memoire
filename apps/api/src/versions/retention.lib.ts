/**
 * §33A.3 retention algorithm — pure and DB-free so the tiered-bucketing
 * logic has real unit test coverage, matching the established pattern of
 * extracting anything algorithmically nontrivial into a `*.lib.ts` (see
 * `search-query.lib.ts`, `csv-parser.lib.ts`).
 *
 * Tiers: last 24h keep everything; last 7d keep newest per hour; last 30d
 * keep newest per day; last 365d keep newest per week; older keep newest per
 * month. `kind !== 'auto'` and the `exemptRecentCount` most recent versions
 * (regardless of kind) are never pruned. `hardCap` applies even when
 * `retentionDays` is null ("keep forever") — a heavily-edited page must not
 * grow `page_versions` unboundedly (ADR-26).
 */
export interface VersionMeta {
  id: string;
  kind: string;
  createdAt: Date;
}

export interface RetentionOptions {
  now: Date;
  retentionDays: number | null;
  hardCap?: number;
  exemptRecentCount?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeVersionsToDelete(versions: VersionMeta[], options: RetentionOptions): string[] {
  const hardCap = options.hardCap ?? 200;
  const exemptCount = options.exemptRecentCount ?? 5;

  const sorted = [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const exemptIds = new Set(sorted.slice(0, exemptCount).map((v) => v.id));
  const auto = sorted.filter((v) => v.kind === 'auto' && !exemptIds.has(v.id));

  const toDelete = new Set<string>();
  const byBucket = new Map<string, VersionMeta[]>();
  for (const v of auto) {
    const key = bucketKey(v, options.now);
    if (key === null) continue; // last 24h — nothing pruned
    const bucket = byBucket.get(key);
    if (bucket) bucket.push(v);
    else byBucket.set(key, [v]);
  }
  for (const bucket of byBucket.values()) {
    bucket.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const v of bucket.slice(1)) toDelete.add(v.id); // keep newest per bucket
  }

  if (options.retentionDays !== null) {
    const cutoff = options.now.getTime() - options.retentionDays * DAY_MS;
    for (const v of auto) {
      if (v.createdAt.getTime() < cutoff) toDelete.add(v.id);
    }
  }

  const remaining = auto
    .filter((v) => !toDelete.has(v.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let over = versions.length - toDelete.size - hardCap;
  for (const v of remaining) {
    if (over <= 0) break;
    toDelete.add(v.id);
    over--;
  }

  return [...toDelete];
}

function bucketKey(v: VersionMeta, now: Date): string | null {
  const age = now.getTime() - v.createdAt.getTime();
  if (age < DAY_MS) return null;
  if (age < 7 * DAY_MS) return `h:${v.createdAt.toISOString().slice(0, 13)}`;
  if (age < 30 * DAY_MS) return `d:${v.createdAt.toISOString().slice(0, 10)}`;
  if (age < 365 * DAY_MS) return `w:${isoWeekKey(v.createdAt)}`;
  return `m:${v.createdAt.getUTCFullYear()}-${v.createdAt.getUTCMonth()}`;
}

/** Stable "YYYY-Www" key (ISO 8601 week number, UTC). */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
