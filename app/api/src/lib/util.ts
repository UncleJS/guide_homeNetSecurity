import { sql } from "drizzle-orm";

// Bump updated_at_UTC on every mutation (UTC, DB-side).
export const touch = () => ({ updatedAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date });

// Set/clear the archive marker (archive-only lifecycle — never hard-delete).
export const archiveMark = () => ({
  archivedAtUTC: sql`UTC_TIMESTAMP()` as unknown as Date,
  ...touch(),
});
export const restoreMark = () => ({
  archivedAtUTC: null,
  ...touch(),
});

// Parse pagination from query (1-based page).
export function paginate(query: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}
