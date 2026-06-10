# NetInventory

The local-only companion app for the [Home Network Security guide](../README.md).
Records subnets/VLANs, devices, IP allocations, open ports, a per-device hardening
checklist, a notes/history trail, and a live interactive **network map**.

- **Web UI:** http://localhost:11290
- **API + Swagger docs:** http://localhost:11291/docs
- **OpenAPI spec:** http://localhost:11291/openapi.json
- **Stack:** Bun + Elysia + MariaDB/Drizzle + React/Vite + React Flow (high-contrast dark)

Everything runs in a rootless Podman pod on your own hardware. Nothing leaves your network.

## Layout

```
app/
  api/   Elysia + Drizzle API (OpenAPI spec-first)
    src/db/schema.ts      archive-only schema, _UTC columns, uniqueness-among-active
    src/routes/*          subnets, devices, ips, ports, hardening, notes, links, map, dashboard
    drizzle/              SQL migrations (applied on container start)
  web/   React + Vite + Tailwind UI
    src/pages/*           Dashboard, Subnets, Devices, DeviceDetail, IpAddresses, NetworkMap
    src/components/*      DateTimeInput, NotesPanel, UI primitives
```

## First run (rootless Podman)

From the repo root (one level up):

```sh
cp .env.example .env        # then edit the passwords
./install.sh                # builds images, installs Quadlet units, starts the pod
```

Open http://localhost:11290.

To load the demo network (the example used in the guide):

```sh
podman exec -w /workspace/app/api netinventory-dev bun run db:seed
```

> **Dev vs prod share the same pod ports (11290/11291).** Never run the dev container
> and the prod web/api at the same time — they will collide. `install.sh` stops the dev
> service before starting prod; stop the prod services before doing dev work.

## Development

All commands run **inside the dev container** — never on the host:

```sh
./dev.sh                                                              # rebuild the dev image
podman exec -w /workspace/app/api netinventory-dev bun run db:migrate # create tables (first run)
podman exec -w /workspace/app/api netinventory-dev bun test           # API unit tests
podman exec -w /workspace/app/api netinventory-dev bun run db:generate # new migration after schema edits
# The dev container already runs the api + web dev servers (its default command).
```

## Notes on conventions

- **Archive-only:** nothing is hard-deleted. "Delete" sets `archived_at_UTC`; restore clears it.
- **UTC everywhere:** datetime columns end in `_UTC`; the UI renders local `yyyy-MM-dd HH:mm:ss`.
- **DB is pod-internal:** MariaDB's port is never published to the host.
- **Docs auth in prod:** set `API_DOCS_TOKEN` in `.env` to gate `/docs` and `/openapi.json`.
