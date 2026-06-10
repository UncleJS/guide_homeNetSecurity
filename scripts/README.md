# Scripts

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](../LICENSE.md) [![Runtime: Podman](https://img.shields.io/badge/runtime-rootless_Podman-892CA0.svg)](../README.md) [![Init: systemd](https://img.shields.io/badge/init-systemd_(Quadlet)-30C9C9.svg)](../README.md)

Lifecycle scripts for the **NetInventory** companion app. Everything runs as **rootless
Podman** managed by **systemd user services** (Quadlet) — no Docker, no root, no bind
mounts. All scripts are path-independent: run them from anywhere (`scripts/install.sh`,
`./install.sh` from inside `scripts/`, etc.); each resolves the repo root itself.

> **Prerequisite:** a repo-local `.env` must exist. Create it once with
> `cp .env.example .env` and edit the passwords.

## Table of contents

- [Scripts at a glance](#scripts-at-a-glance)
- [install.sh](#installsh)
- [start.sh](#startsh)
- [stop.sh](#stopsh)
- [restart.sh](#restartsh)
- [rebuild.sh](#rebuildsh)
- [teardown.sh](#teardownsh)
- [dev.sh](#devsh)
- [The dev vs prod port clash](#the-dev-vs-prod-port-clash)

## Scripts at a glance

| Script | What it does | Options |
|--------|--------------|---------|
| `install.sh` | Build prod images, install Quadlet units, start the pod | — |
| `start.sh` | Start the pod (mariadb → api → web) | — |
| `stop.sh` | Stop the pod; **keep** data volume & images | — |
| `restart.sh` | Restart the pod in dependency order | — |
| `rebuild.sh` | Rebuild images from source, restart services | `--dev`, `--no-restart` |
| `teardown.sh` | Remove units/containers/images for this project | `--purge-volumes` |
| `dev.sh` | Rebuild the dev image and (re)start the dev container | — |

[↑ Back to top](#table-of-contents)

## `install.sh`

First-time setup. Builds the `api`, `web`, and `dev` images, copies the **prod** Quadlet
units into `~/.config/containers/systemd/`, reloads systemd, stops any running dev
container (it shares the pod ports), and starts `mariadb → api → web`.

```sh
scripts/install.sh
```

- Aborts if repo-local `.env` is missing.
- Installs **only prod** units. The dev unit is deliberately *not* installed, because a
  Quadlet `.pod` auto-starts every member container and dev would collide with prod on
  ports 11290/11291.
- Safe to re-run; it reinstalls units and restarts services.

[↑ Back to top](#table-of-contents)

## `start.sh`

Start the production pod without rebuilding anything. Stops the dev container first, then
starts `mariadb → api → web` in dependency order.

```sh
scripts/start.sh
```

[↑ Back to top](#table-of-contents)

## `stop.sh`

Stop the production pod (`web → api → mariadb`) and the pod infra container. The named
**data volume and images are preserved** — this is a clean shutdown, not a teardown.

```sh
scripts/stop.sh
```

[↑ Back to top](#table-of-contents)

## `restart.sh`

Restart the running pod in dependency order (`mariadb → api → web`). Stops the dev
container first. Use after editing a Quadlet unit or `.env`.

```sh
scripts/restart.sh
```

[↑ Back to top](#table-of-contents)

## `rebuild.sh`

Rebuild the production images from source and restart the services so the new images take
effect. The database volume is untouched.

```sh
scripts/rebuild.sh              # rebuild api + web, restart api + web
scripts/rebuild.sh --dev        # also rebuild the dev image
scripts/rebuild.sh --no-restart # build images only, leave services running on old images
```

| Option | Effect |
|--------|--------|
| `--dev` | Also rebuild `netinventory-dev:latest` (does not restart prod). |
| `--no-restart` | Build images but do not restart services. |

[↑ Back to top](#table-of-contents)

## `teardown.sh`

Project-scoped **full teardown**. Stops and disables this project's units, removes its
containers, images, and Quadlet unit files. **Never prunes** anything outside the project.

```sh
scripts/teardown.sh                  # remove everything EXCEPT the data volume
scripts/teardown.sh --purge-volumes  # ALSO delete the MariaDB volume (DESTRUCTIVE)
```

| Option | Effect |
|--------|--------|
| *(none)* | Removes units/containers/images; **keeps** the database volume. |
| `--purge-volumes` | Additionally deletes the named volumes — **irreversible data loss**. |

> ⚠️ `--purge-volumes` permanently deletes your inventory database. There is no undo.

[↑ Back to top](#table-of-contents)

## `dev.sh`

Rebuild the dev image and restart the dev container for local development. The dev
container runs the api + web dev servers as its default command.

```sh
scripts/dev.sh
```

Guards: aborts if repo-local `.env` is missing, or if a stale host-level
`~/.config/containers/systemd/netinventory.env` exists (env files must be repo-local).

[↑ Back to top](#table-of-contents)

## The dev vs prod port clash

Dev and prod both bind the pod's ports **11290** (web) and **11291** (api). **Never run
both at once.** `install.sh`, `start.sh`, and `restart.sh` stop the dev container before
starting prod. Before doing dev work, stop prod first:

```sh
scripts/stop.sh
scripts/dev.sh
```

[↑ Back to top](#table-of-contents)

---

<sub>🔐 Part of the **[Home Network Security guide](../README.md)** · 📦 companion app **[NetInventory](../app/)** · 📄 Licensed under **[CC BY-NC-SA 4.0](../LICENSE.md)** · © 2026</sub>
