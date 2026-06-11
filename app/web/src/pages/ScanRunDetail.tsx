import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPost, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { NotesPanel } from "@/components/NotesPanel";
import { formatLocal } from "@/lib/format";
import { RUN_STATUS_CLASS } from "./Schedules.tsx";

interface Finding {
  id: number; ipAddress: string; hostname: string | null; port: number;
  protocol: string; state: string; service: string | null;
}

interface RunFull {
  id: number; scheduleId: number; scheduleName: string | null;
  scheduledForUTC: string; startedAtUTC: string | null; finishedAtUTC: string | null;
  status: "running" | "completed" | "failed"; hostsScanned: number; openPorts: number;
  error: string | null; findings: Finding[];
}

interface ImportSummary {
  imported: number; updated: number; skippedState: number; skippedUnmatched: string[];
}

export function ScanRunDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi<RunFull>(`/scan-runs/${id}`);

  // While the scan is executing, poll until it settles.
  useEffect(() => {
    if (data?.status !== "running") return;
    const timer = setInterval(() => void refetch(), 5_000);
    return () => clearInterval(timer);
  }, [data?.status, refetch]);

  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const importMut = useMutation();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  function importFindings(findingIds?: number[]) {
    return importMut.run(async () => {
      const res = await apiPost<ImportSummary>(
        `/scan-runs/${id}/import-findings`,
        findingIds ? { findingIds } : {},
      );
      setImportResult(res);
    });
  }

  const openCount = data.findings.filter((f) => f.state === "open").length;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/schedules/${data.scheduleId}`} className="text-sm text-foreground underline-offset-2 hover:underline">
          ← {data.scheduleName ?? "Schedule"}
        </Link>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground">
          Scan run #{data.id}
          <Badge className={RUN_STATUS_CLASS[data.status]}>{data.status}</Badge>
        </h1>
      </div>

      <Card>
        <CardTitle className="mb-3">Run</CardTitle>
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <div><dt className="font-medium text-foreground opacity-80">Scheduled for</dt><dd className="text-foreground">{formatLocal(data.scheduledForUTC)}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Started</dt><dd className="text-foreground">{formatLocal(data.startedAtUTC)}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Finished</dt><dd className="text-foreground">{formatLocal(data.finishedAtUTC)}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Hosts up</dt><dd className="text-foreground">{data.hostsScanned}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Open ports</dt><dd className="text-foreground">{data.openPorts}</dd></div>
        </dl>
        {data.status === "running" && <p className="mt-3 text-sm text-foreground">Scan in progress — refreshing every 5 seconds…</p>}
        {data.error && <p className="mt-3 text-sm text-danger">{data.error}</p>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Findings</CardTitle>
          <Button
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => importFindings()}
            disabled={importMut.pending || openCount === 0}
          >
            {importMut.pending ? "Importing…" : "Import all findings"}
          </Button>
        </div>
        {importMut.error && <p className="mb-2 text-sm text-danger">{importMut.error}</p>}
        {importResult && (
          <div className="mb-3 rounded-md border border-border p-2 text-sm text-foreground">
            <p>
              Imported {importResult.imported} · Updated {importResult.updated} · Skipped (not open) {importResult.skippedState}
            </p>
            {importResult.skippedUnmatched.length > 0 && (
              <p className="mt-1">
                No registered device for{" "}
                <span className="font-mono">{importResult.skippedUnmatched.join(", ")}</span>
                {" — "}assign these under <Link to="/ip-addresses" className="underline underline-offset-2">IP Addresses</Link> first.
              </p>
            )}
          </div>
        )}
        {data.findings.length === 0 && (
          <Empty title={data.status === "running" ? "Scanning…" : "No open ports found"}>
            {data.status === "completed" && "The scan completed without discovering open TCP ports on the target."}
          </Empty>
        )}
        {data.findings.length > 0 && (
          <Table>
            <thead><tr>
              <Th>IP</Th><Th>Hostname</Th><Th>Port</Th><Th>Proto</Th><Th>State</Th><Th>Service</Th><Th className="text-right">Actions</Th>
            </tr></thead>
            <tbody>
              {data.findings.map((f) => (
                <tr key={f.id}>
                  <Td className="font-mono">{f.ipAddress}</Td>
                  <Td>{f.hostname ?? "—"}</Td>
                  <Td className="font-mono">{f.port}</Td>
                  <Td>{f.protocol}</Td>
                  <Td><Badge className="border-warning">{f.state}</Badge></Td>
                  <Td>{f.service ?? "—"}</Td>
                  <Td className="text-right">
                    {f.state === "open" && (
                      <Button
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => importFindings([f.id])}
                        disabled={importMut.pending}
                      >
                        Add to device
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <NotesPanel entityType="scan_run" entityId={data.id} />
    </div>
  );
}
