import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.MARIADB_USER ?? "netinventory",
    password: process.env.MARIADB_PASSWORD ?? "",
    database: process.env.MARIADB_DATABASE ?? "netinventory",
  },
});
