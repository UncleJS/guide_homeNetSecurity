// nmap invocation + grepable-output parsing for scheduled scans.
// Rootless pod = no CAP_NET_RAW, so only unprivileged -sT connect scans work
// (no SYN scan, no ICMP echo). Pure functions are exported for unit tests.

export interface ScanFinding {
  ipAddress: string;
  hostname: string | null;
  port: number;
  protocol: string;
  state: string;
  service: string | null;
}

export interface ScanResult {
  hostsUp: number;
  findings: ScanFinding[];
}

const PORT_SPEC_RE = /^[0-9,\-]+$/;

export function isValidPortSpec(spec: string): boolean {
  return spec === "top100" || spec === "top1000" || PORT_SPEC_RE.test(spec);
}

export function buildPortArgs(spec: string): string[] {
  if (spec === "top100") return ["--top-ports", "100"];
  if (spec === "top1000") return ["--top-ports", "1000"];
  if (!PORT_SPEC_RE.test(spec)) throw new Error(`Invalid port spec: ${spec}`);
  return ["-p", spec];
}

export function buildNmapArgs(targets: string[], portSpec: string, singleHost: boolean): string[] {
  return [
    "-sT",
    "-T4",
    "--host-timeout", "90s",
    ...buildPortArgs(portSpec),
    // Subnet sweeps use unprivileged TCP connect host discovery; a single
    // (possibly firewalled) host gets -Pn so it is port-scanned regardless.
    ...(singleHost ? ["-Pn"] : []),
    "-oG", "-",
    ...targets,
  ];
}

// Parse `nmap -oG -` output. Port entries look like:
//   Host: 192.168.1.10 (nas.lan)\tPorts: 22/open/tcp//ssh///, 443/open/tcp//https///\t...
export function parseGrepable(stdout: string): ScanResult {
  const findings: ScanFinding[] = [];
  let hostsUp = 0;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("Host:")) continue;
    if (/\bStatus: Up\b/.test(line)) hostsUp++;
    const head = line.match(/^Host:\s+(\S+)\s+\(([^)]*)\)/);
    if (!head) continue;
    const ipAddress = head[1];
    const hostname = head[2] || null;
    const portsSeg = line.match(/\tPorts:\s+([^\t]+)/);
    if (!portsSeg) continue;
    for (const entry of portsSeg[1].split(", ")) {
      const [port, state, protocol, , service] = entry.split("/");
      if (state !== "open") continue;
      findings.push({
        ipAddress,
        hostname,
        port: Number(port),
        protocol: protocol || "tcp",
        state,
        service: service || null,
      });
    }
  }
  return { hostsUp, findings };
}

export async function runNmap(args: string[], timeoutMs?: number): Promise<string> {
  const limit = timeoutMs ?? Number(process.env.SCAN_TIMEOUT_MS ?? 600_000);
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["nmap", ...args], { stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new Error("nmap is not installed in this container");
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, limit);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    if (timedOut) throw new Error(`nmap timed out after ${limit}ms`);
    if (exitCode !== 0) {
      const tail = stderr.trim().split("\n").slice(-3).join(" | ");
      throw new Error(`nmap exited with code ${exitCode}: ${tail || "no stderr"}`);
    }
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}
