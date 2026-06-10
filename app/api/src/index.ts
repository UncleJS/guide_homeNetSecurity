import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { subnetRoutes } from "./routes/subnets.ts";
import { deviceRoutes } from "./routes/devices.ts";
import { ipRoutes } from "./routes/ips.ts";
import { portRoutes } from "./routes/ports.ts";
import { hardeningRoutes } from "./routes/hardening.ts";
import { noteRoutes } from "./routes/notes.ts";
import { linkRoutes } from "./routes/links.ts";
import { mapRoutes } from "./routes/map.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";

const PORT = Number(process.env.API_PORT ?? 11291);
const CORS_ORIGIN = (process.env.API_CORS_ORIGIN ?? "http://localhost:11290").split(",");
const DOCS_TOKEN = process.env.API_DOCS_TOKEN ?? "";

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { message: "Validation failed", detail: error.message };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Not found" };
    }
    set.status = 500;
    console.error(error);
    return { message: "Internal server error" };
  })
  .use(cors({ origin: CORS_ORIGIN, credentials: true }))
  // Production: gate the docs behind a token if API_DOCS_TOKEN is set.
  .onBeforeHandle(({ request, set, path }) => {
    if (!DOCS_TOKEN) return;
    if (path === "/docs" || path === "/docs/json" || path === "/openapi.json") {
      const url = new URL(request.url);
      if (url.searchParams.get("token") !== DOCS_TOKEN) {
        set.status = 401;
        return { message: "Docs require a token" };
      }
    }
  })
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "NetInventory API",
          version: "0.1.0",
          description:
            "Local-only home-network asset inventory: subnets, devices, IPs, ports, hardening, notes/history, topology links, and a network map.",
        },
        tags: [
          { name: "Subnets" }, { name: "Devices" }, { name: "IP Addresses" },
          { name: "Device Ports" }, { name: "Hardening" }, { name: "Notes" },
          { name: "Topology Links" }, { name: "Network Map" }, { name: "Dashboard" },
        ],
      },
    }),
  )
  // Canonical spec location per house standard.
  .get("/openapi.json", ({ redirect }) => redirect("/docs/json", 302), {
    detail: { summary: "OpenAPI spec (redirects to the generated document)" },
  })
  .get("/health", () => ({ status: "ok" }), { detail: { summary: "Liveness probe" } })
  .group("/api", (api) =>
    api
      .use(subnetRoutes)
      .use(deviceRoutes)
      .use(ipRoutes)
      .use(portRoutes)
      .use(hardeningRoutes)
      .use(noteRoutes)
      .use(linkRoutes)
      .use(mapRoutes)
      .use(dashboardRoutes),
  )
  .listen(PORT);

console.log(`NetInventory API on http://localhost:${PORT}  (docs: /docs)`);

export type App = typeof app;
