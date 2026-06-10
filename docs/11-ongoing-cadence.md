# 11 — Ongoing Cadence & Checklists  🟢

Security decays. New devices appear, firmware goes stale, rules drift. Put the loop on a
calendar so it actually happens. NetInventory is your source of truth between cycles.

## The cadence

```mermaid
gantt
    title Home network security cadence
    dateFormat YYYY-MM-DD
    axisFormat %b
    section Weekly
    Check IDS/DNS alerts & firewall denies      :w1, 2026-01-01, 7d
    section Monthly
    Verify backups (test a restore)             :m1, 2026-01-01, 30d
    Review new devices vs inventory             :m2, 2026-01-01, 30d
    Apply pending firmware updates              :m3, 2026-01-01, 30d
    section Quarterly
    Full re-assessment (Ch.03)                  :q1, 2026-01-01, 90d
    Re-scan external exposure                   :q2, 2026-01-01, 90d
    Review firewall & VLAN rules                :q3, 2026-01-01, 90d
    section Annually
    Audit EOL gear & replace                    :y1, 2026-01-01, 365d
    Review threat model                         :y2, 2026-01-01, 365d
```

## Weekly (5 minutes)

- [ ] Glance at IDS/DNS alerts and firewall deny logs (Chapter 08).
- [ ] Investigate any **unknown device** on the network.

## Monthly (30 minutes)

- [ ] **Test-restore** a file from backup (Chapter 09). A backup is only real if it restores.
- [ ] Reconcile the network against NetInventory — add new devices, archive retired ones.
- [ ] Apply any pending firmware/OS updates not handled automatically.
- [ ] Skim the DNS query log for chatty/suspicious devices.

## Quarterly (a focused afternoon)

- [ ] Re-run the **full assessment** (Chapter 03): internal scan + external exposure check.
- [ ] Confirm UPnP is still off and no stale port-forwards crept back.
- [ ] Review firewall and inter-VLAN rules — remove temporary rules that became permanent.
- [ ] Confirm hardening checklist is still 100% in NetInventory.

## Annually

- [ ] Audit **end-of-life** hardware; budget replacements for anything off support.
- [ ] Re-read your **threat model** (Chapter 01) — has anything changed (new work-from-home
      setup, new smart-home system, kids online)?
- [ ] Rotate critical passwords; re-check MFA coverage.

## Using NetInventory as the system of record

| Question | Where it lives |
|----------|----------------|
| What devices/IPs do I have? | Devices + IP Addresses |
| How is the network laid out? | Network Map |
| What's the riskiest thing right now? | Dashboard (high-risk count) |
| Is my hardening complete? | Dashboard (hardening %) + per-device checklist |
| What happened to this device over time? | Per-item notes / history |
| What changed since last quarter? | Notes timeline + archived (retired) items |

## You're done (for now)

Run the loop, keep the inventory honest, and you'll be well past the low-hanging fruit
that automated attacks feed on. Security isn't a finish line — it's a habit, and you now
have both the habit and the tooling.

⬅️ Back to [the guide index](../README.md) · Set up [the app](../app/)
