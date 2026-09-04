import { describe, expect, it } from 'vitest';
import { computeVersionsToDelete, VersionMeta } from './retention.lib';

const NOW = new Date('2026-09-03T12:00:00Z');
const hoursAgo = (h: number, id: string, kind = 'auto'): VersionMeta => ({
  id,
  kind,
  createdAt: new Date(NOW.getTime() - h * 60 * 60 * 1000),
});
const daysAgo = (d: number, id: string, kind = 'auto'): VersionMeta => hoursAgo(d * 24, id, kind);

describe('computeVersionsToDelete', () => {
  it('keeps everything from the last 24 hours', () => {
    const versions = [hoursAgo(1, 'a'), hoursAgo(5, 'b'), hoursAgo(23, 'c')];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toEqual([]);
  });

  it('collapses same-hour auto versions in the 24h-7d window to the newest', () => {
    const versions = [
      { id: 'old', kind: 'auto', createdAt: new Date('2026-09-01T10:05:00Z') },
      { id: 'new', kind: 'auto', createdAt: new Date('2026-09-01T10:40:00Z') },
      // 5 very-recent entries fill the exemptRecentCount window, pushing
      // old/new (~49h ago) out of it so the hour-bucket rule actually runs.
      ...Array.from({ length: 5 }, (_, i) => hoursAgo(1 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toContain('old');
    expect(result).not.toContain('new');
  });

  it('collapses same-day auto versions in the 7d-30d window to the newest', () => {
    const versions = [
      { id: 'old', kind: 'auto', createdAt: new Date('2026-08-20T02:00:00Z') },
      { id: 'new', kind: 'auto', createdAt: new Date('2026-08-20T22:00:00Z') },
      ...Array.from({ length: 5 }, (_, i) => daysAgo(1 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toContain('old');
    expect(result).not.toContain('new');
  });

  it('collapses same-week auto versions in the 30d-365d window to the newest', () => {
    const versions = [
      { id: 'old', kind: 'auto', createdAt: new Date('2026-06-01T02:00:00Z') },
      { id: 'new', kind: 'auto', createdAt: new Date('2026-06-03T22:00:00Z') },
      ...Array.from({ length: 5 }, (_, i) => daysAgo(31 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toContain('old');
    expect(result).not.toContain('new');
  });

  it('collapses same-month auto versions beyond 365d to the newest', () => {
    const versions = [
      { id: 'old', kind: 'auto', createdAt: new Date('2024-01-02T02:00:00Z') },
      { id: 'new', kind: 'auto', createdAt: new Date('2024-01-20T22:00:00Z') },
      ...Array.from({ length: 5 }, (_, i) => daysAgo(370 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toContain('old');
    expect(result).not.toContain('new');
  });

  it('never deletes a non-auto version, even if very old', () => {
    const versions = [
      daysAgo(1000, 'manual', 'manual'),
      daysAgo(1000, 'pre_restore', 'pre_restore'),
      ...Array.from({ length: 5 }, (_, i) => daysAgo(1000 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).not.toContain('manual');
    expect(result).not.toContain('pre_restore');
  });

  it('never deletes the 5 most recent versions regardless of kind or age', () => {
    const versions = Array.from({ length: 5 }, (_, i) => daysAgo(1000 + i, `recent${i}`));
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null });
    expect(result).toEqual([]);
  });

  it('applies retentionDays as a hard outer cutoff overriding the monthly tier', () => {
    const versions = [
      daysAgo(10, 'within'),
      daysAgo(40, 'outside'),
      ...Array.from({ length: 5 }, (_, i) => daysAgo(1 + i, `pad${i}`)),
    ];
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays:30 });
    expect(result).toContain('outside');
    expect(result).not.toContain('within');
  });

  it('trims oldest auto versions once over the hard cap, even under retentionDays: null', () => {
    const versions = Array.from({ length: 210 }, (_, i) => daysAgo(2000 + i, `v${i}`));
    const result = computeVersionsToDelete(versions, { now: NOW, retentionDays: null, hardCap: 200 });
    const remaining = versions.length - result.length;
    expect(remaining).toBeLessThanOrEqual(200);
    // Oldest (largest index) should be the ones trimmed first.
    expect(result).toContain('v209');
    expect(result).not.toContain('v0');
  });
});
