# Home Network Security — Assess & Harden (Beginner → Advanced)

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](LICENSE.md) [![Guide](https://img.shields.io/badge/guide-12_chapters-1f6feb.svg)](#read-in-order) [![App: NetInventory](https://img.shields.io/badge/app-NetInventory-2ea043.svg)](app/) [![Stack](https://img.shields.io/badge/stack-Bun_+_Elysia_+_MariaDB_+_React-555.svg)](app/) [![Runtime: Podman](https://img.shields.io/badge/runtime-rootless_Podman-892CA0.svg)](scripts/README.md)

A practical, vendor-neutral guide to **assessing and hardening a home / prosumer network**
against modern threats — plus a self-hosted companion web app, **NetInventory**, to record
your IP addresses, devices, subnets/VLANs, hardening status, and a live network map.

> The guide teaches you *what* to do. NetInventory gives you a place to *track* it.
> You can't defend what you can't see — so everything starts with an inventory.

---

## Table of contents

- [Who this is for](#who-this-is-for)
- [The core loop](#the-core-loop)
- [Read in order](#read-in-order)
- [The companion app — NetInventory](#the-companion-app--netinventory)
- [A note on scope & ethics](#a-note-on-scope--ethics)

## Who this is for

Home users and prosumers running gear like consumer routers, UniFi, OPNsense/pfSense,
Pi-hole/AdGuard, and WireGuard. No enterprise/compliance jargon. Sections are tagged by
difficulty so you can stop wherever your setup and appetite end:

- 🟢 **Beginner** — anyone with a home router can do this.
- 🟡 **Intermediate** — comfortable with a managed switch, VLANs, a dedicated firewall.
- 🔴 **Advanced** — running your own IDS/IPS, logging, and detection.

---


[↑ Back to top](#table-of-contents)

## The core loop

Security isn't a one-time project. It's a loop you repeat.

```mermaid
flowchart LR
    A(["Inventory<br/>(know what you have)"]) --> B["Assess<br/>(find weaknesses)"]
    B --> C["Harden<br/>(fix & reduce attack surface)"]
    C --> D["Monitor<br/>(watch for trouble)"]
    D --> E["Respond<br/>(contain & recover)"]
    E --> A
```

---


[↑ Back to top](#table-of-contents)

## Read in order

| # | Chapter | Level |
|---|---------|-------|
| 00 | [Overview & how to use this guide](docs/00-overview.md) | 🟢 |
| 01 | [Threat model — who attacks home networks and why](docs/01-threat-model.md) | 🟢 |
| 02 | [Network fundamentals refresher](docs/02-fundamentals.md) | 🟢 |
| 03 | [Phase 1 — Assess your network](docs/03-assess.md) | 🟢🟡 |
| 04 | [Phase 2 — Baseline hardening](docs/04-baseline-hardening.md) | 🟢 |
| 05 | [Phase 3 — Segmentation & VLANs](docs/05-segmentation.md) | 🟡 |
| 06 | [Phase 4 — Network services (DNS, NTP, mDNS)](docs/06-network-services.md) | 🟡 |
| 07 | [Phase 5 — Perimeter & remote access](docs/07-perimeter-remote-access.md) | 🟡🔴 |
| 08 | [Phase 6 — Monitoring & detection](docs/08-monitoring-detection.md) | 🔴 |
| 09 | [Phase 7 — Endpoint & supporting hygiene](docs/09-endpoint-hygiene.md) | 🟡 |
| 10 | [Phase 8 — Incident response for the home](docs/10-incident-response.md) | 🔴 |
| 11 | [Ongoing cadence & checklists](docs/11-ongoing-cadence.md) | 🟢 |

---


[↑ Back to top](#table-of-contents)

## The companion app — NetInventory

A local-only inventory + hardening tracker with a live, interactive network map.
It runs in a rootless Podman pod on your own hardware — nothing leaves your network.

- **Frontend:** http://localhost:11290
- **API + Swagger docs:** http://localhost:11291/docs
- **Stack:** Bun + Elysia + MariaDB/Drizzle + React/Vite/shadcn (high-contrast dark)

See [`app/`](app/) for the application, [`.quadlet/`](.quadlet/) for the Podman/systemd
(Quadlet) units, and [`scripts/`](scripts/README.md) for the install / start / stop /
restart / rebuild / teardown lifecycle. App setup lives in [`app/README.md`](app/README.md).

```sh
cp .env.example .env     # set your passwords
scripts/install.sh       # build images, install Quadlet units, start the pod
```

```mermaid
graph TD
    subgraph pod["netinventory-pod (rootless Podman)"]
        web["web :11290<br/>React UI"]
        api["api :11291<br/>Elysia + Drizzle"]
        db[("mariadb<br/>pod-internal<br/>named volume")]
    end
    you["You (LAN browser)"] -->|"http :11290"| web
    web -->|"/api → :11291"| api
    api -->|"internal :3306"| db
```

---


[↑ Back to top](#table-of-contents)

## A note on scope & ethics

Every assessment technique here is meant for **networks you own or are explicitly
authorized to test**. Scanning, probing, or de-authing networks you don't control is
illegal in most places. Keep it to your own LAN.

[↑ Back to top](#table-of-contents)

---

<sub>🔐 **Home Network Security — Assess & Harden** · 📦 companion app **[NetInventory](app/)** · 🛠 lifecycle **[scripts](scripts/README.md)** · 📄 Licensed under **[CC BY-NC-SA 4.0](LICENSE.md)** · © 2026</sub>
