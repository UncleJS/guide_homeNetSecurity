// Display helpers. DB/API values are UTC; we render in the viewer's LOCAL time
// as `yyyy-MM-dd HH:mm:ss` (never dd-mm-yyyy / mm-dd-yyyy).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Parse a server datetime (UTC). MariaDB DATETIME comes back as
// "yyyy-MM-dd HH:mm:ss" (no zone) — treat it as UTC.
function parseServerUTC(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(value.replace(" ", "T") + "Z");
  }
  return new Date(value);
}

export function formatLocal(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = parseServerUTC(value);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function relativeAge(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const d = parseServerUTC(value);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// Convert a local "yyyy-MM-dd HH:mm:ss" (from DateTimeInput) to ISO-8601 UTC.
export function localToISO(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m.map(Number) as unknown as number[];
  const d = new Date(y, mo - 1, da, h, mi, s); // interpreted as local
  return d.toISOString();
}

// Local calendar-day key ("yyyy-MM-dd") for a server UTC datetime — used to
// bucket events into day cells of the month calendar.
export function localDateKey(value: string | Date): string {
  const d = parseServerUTC(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Convert an ISO/UTC value back to local "yyyy-MM-dd HH:mm:ss" for editing.
export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = parseServerUTC(value);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
