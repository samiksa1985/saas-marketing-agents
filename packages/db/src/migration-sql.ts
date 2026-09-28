/**
 * PostgreSQL accepts ordinary UTF-8 SQL text, not a U+FEFF token before the
 * first statement. Normalize only that one leading byte-order mark: migration
 * content is otherwise opaque and must stay byte-for-byte semantically intact.
 */
export function normalizeMigrationSql(source: string): string {
  return source.startsWith('\uFEFF') ? source.slice(1) : source;
}
