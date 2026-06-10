import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.ts";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.MARIADB_USER ?? "netinventory",
  password: process.env.MARIADB_PASSWORD ?? "",
  database: process.env.MARIADB_DATABASE ?? "netinventory",
  // Store and read UTC; never let the driver apply a local offset.
  timezone: "Z",
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });
export { schema, pool };
