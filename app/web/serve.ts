// Production static server: serves the built SPA with history fallback.
const PORT = Number(process.env.WEB_PORT ?? 11290);
const DIST = `${import.meta.dir}/dist`;

Bun.serve({
  port: PORT,
  // Bind dual-stack (::) so IPv6 clients work too — browsers resolve
  // localhost to ::1 first. 0.0.0.0 would be IPv4-only and break the browser.
  hostname: "::",
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    let file = Bun.file(DIST + pathname);
    if (!(await file.exists())) {
      // SPA fallback — let the client router handle unknown paths.
      file = Bun.file(`${DIST}/index.html`);
    }
    return new Response(file, {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
      },
    });
  },
});

console.log(`NetInventory web on http://localhost:${PORT}`);
