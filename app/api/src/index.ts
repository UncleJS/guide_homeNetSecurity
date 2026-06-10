import { app } from "./app.ts";
import { startScheduler } from "./lib/scheduler.ts";

const PORT = Number(process.env.API_PORT ?? 11291);

app.listen(PORT);
startScheduler();

console.log(`NetInventory API on http://localhost:${PORT}  (docs: /docs)`);

export type { App } from "./app.ts";
