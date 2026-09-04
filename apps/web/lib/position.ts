/**
 * Thin re-export — the implementation lives in @memoire/validation so both
 * apps share one copy (§39A.5 invariant 11, Sprint 21).
 */
export { fractionalPosition, needsRenormalization, renormalizePositions } from '@memoire/validation';
