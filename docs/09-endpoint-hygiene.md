# 09 — Phase 7: Endpoint & Supporting Hygiene  🟡

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](../LICENSE.md) [![Guide](https://img.shields.io/badge/guide-Home_Network_Security-1f6feb.svg)](../README.md) [![App](https://img.shields.io/badge/app-NetInventory-2ea043.svg)](../app/)

The network is only as strong as the devices on it. A hardened firewall won't help if a
laptop gets phished and the attacker is already *inside* your trusted zone. These habits
are unglamorous and decisive.

## Table of contents

- [Patch everything, automatically](#patch-everything-automatically)
- [Accounts: MFA + a password manager](#accounts-mfa--a-password-manager)
- [Backups: the 3-2-1 rule](#backups-the-3-2-1-rule)
- [Browser & DNS hygiene](#browser--dns-hygiene)
- [The human layer: phishing](#the-human-layer-phishing)
- [IoT & guest device policy](#iot--guest-device-policy)

## Patch everything, automatically

- Enable **automatic OS updates** on every PC, phone, and tablet.
- Enable **firmware auto-update** on router, AP, NAS, and IoT where available.
- **Replace end-of-life gear.** A router or NAS that no longer gets security updates is a
  liability no configuration can fix. Track EOL dates in NetInventory notes.


[↑ Back to top](#table-of-contents)

## Accounts: MFA + a password manager

- **Use a password manager** (Bitwarden/Vaultwarden self-hosted, KeePassXC, 1Password) so
  every account has a unique, strong password. Credential reuse is how one breach becomes
  many.
- **Turn on MFA** everywhere it's offered — especially email (the master key to password
  resets), your DNS/registrar, NAS, and any remote-access account. Prefer app/hardware
  tokens over SMS.
- Change **default credentials** on every device (yes, again — it's that important).


[↑ Back to top](#table-of-contents)

## Backups: the 3-2-1 rule

The only reliable defense against ransomware and hardware failure.

```mermaid
graph TD
    DATA["Your data"] --> C1["Copy 1<br/>primary (PC / NAS)"]
    DATA --> C2["Copy 2<br/>different media/device"]
    DATA --> C3["Copy 3<br/>offsite / immutable"]
    C3 --> OFF["Offline or<br/>append-only<br/>(ransomware can't reach it)"]
```

- **3** copies of important data, on **2** different media, with **1** offsite.
- At least one copy **offline or immutable** — ransomware encrypts everything it can
  reach, including network shares and many cloud syncs. An always-connected backup is not
  a backup against ransomware.
- **Test a restore.** A backup you've never restored from is a hope, not a backup.


[↑ Back to top](#table-of-contents)

## Browser & DNS hygiene

- Keep browsers updated; use an ad/tracker blocker (also blocks many malware domains).
- Your filtering DNS (Chapter 06) is doing quiet work here — keep blocklists fresh.
- Be ruthless about browser extensions; each is code with access to your sessions.


[↑ Back to top](#table-of-contents)

## The human layer: phishing

Most home compromises start with a click, not a packet. A few durable habits:

- Treat unexpected attachments and "urgent" login links as hostile until verified.
- Verify out-of-band (call the bank, don't click the email's link).
- MFA turns a stolen password into a non-event for most services.


[↑ Back to top](#table-of-contents)

## IoT & guest device policy

- Put untrusted IoT on the **iot** zone / isolated guest WiFi (Chapters 04–05).
- Before buying smart-home gear, check whether it still gets updates and whether it works
  **locally** (without mandatory cloud). Cloud-only devices are a standing supply-chain
  risk.
- Guests go on the **guest** network — never share your trusted passphrase.

> **Record it:** Use NetInventory's hardening checklist per device for "auto-update on,"
> "MFA on (where applicable)," and "EOL date noted." Set `risk_level = high` on any
> end-of-life device until it's replaced or isolated.

➡️ Next: [10 — Incident response](10-incident-response.md)

[↑ Back to top](#table-of-contents)

---

<sub>🔐 Part of the **[Home Network Security guide](../README.md)** · 📦 companion app **[NetInventory](../app/)** · 📄 Licensed under **[CC BY-NC-SA 4.0](../LICENSE.md)** · © 2026</sub>
