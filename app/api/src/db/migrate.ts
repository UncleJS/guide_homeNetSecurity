import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

// Standalone migration runner (used by the API container on startup).
const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.MARIADB_USER ?? "netinventory",
  password: process.env.MARIADB_PASSWORD ?? "",
  database: process.env.MARIADB_DATABASE ?? "netinventory",
  timezone: "Z",
  multipleStatements: true,
});

const db = drizzle(connection);
console.log("Running migrations…");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");
await connection.end();
