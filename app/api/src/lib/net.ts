// Usable IPv4 host count from a CIDR. Returns null for IPv6 / unparseable input.
export function ipv4Capacity(cidr: string): number | null {
  const m = cidr.match(/^\d+\.\d+\.\d+\.\d+\/(\d+)$/);
  if (!m) return null;
  const prefix = Number(m[1]);
  if (prefix < 0 || prefix > 32) return null;
  if (prefix >= 31) return 2 ** (32 - prefix); // /31, /32 have no network/broadcast reservation
  return 2 ** (32 - prefix) - 2;
}
