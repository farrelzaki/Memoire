/** Renders a row's `unique_id_seq` with its property's configured prefix (§20A.2), e.g. "TASK-14". */
export function formatUniqueId(prefix: string | undefined, seq: number): string {
  return `${prefix ?? ''}${seq}`;
}
