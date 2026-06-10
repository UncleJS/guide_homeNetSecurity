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

// Map MariaDB error codes to clean 4xx responses instead of generic 500s.
const errCode = (e: unknown) =>
  typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
export const isDupError = (e: unknown) => errCode(e) === "ER_DUP_ENTRY";
export const isFkError = (e: unknown) =>
  errCode(e) === "ER_NO_REFERENCED_ROW_2" || errCode(e) === "ER_NO_REFERENCED_ROW";

// affectedRows from a drizzle/mysql2 write result ([ResultSetHeader, ...]).
export const affected = (res: unknown): number => {
  const header = Array.isArray(res) ? res[0] : res;
  return (header as { affectedRows?: number })?.affectedRows ?? 0;
};

// Parse pagination from query (1-based page).
export function paginate(query: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}
