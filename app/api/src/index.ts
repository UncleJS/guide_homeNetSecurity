import { app } from "./app.ts";

const PORT = Number(process.env.API_PORT ?? 11291);

app.listen(PORT);

console.log(`NetInventory API on http://localhost:${PORT}  (docs: /docs)`);

export type { App } from "./app.ts";
