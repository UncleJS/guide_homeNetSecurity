// Default hardening controls seeded onto every new device.
// Mirrors the baseline checklist in docs/04-baseline-hardening.md.
export const DEFAULT_HARDENING_CONTROLS = [
  "Changed default/admin credentials",
  "Firmware up to date / auto-update enabled",
  "Disabled unused remote management (Telnet/SNMP/WAN admin)",
  "On the correct trust zone / VLAN",
  "MFA enabled (where applicable)",
  "Not end-of-life (still receiving updates)",
] as const;
