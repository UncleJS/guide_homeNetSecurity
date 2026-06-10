import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPatch, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Modal, Table, Th, Td, Textarea } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { NotesPanel } from "@/components/NotesPanel";
import { formatLocal } from "@/lib/format";
import { RUN_STATUS_CLASS } from "./Schedules.tsx";

interface Finding {
  id: number; ipAddress: string; hostname: string | null; port: number;
  protocol: string; state: string; service: string | null; notes: string | null;
}

interface RunFull {
  id: number; scheduleId: number; scheduleName: string | null;
  scheduledForUTC: string; startedAtUTC: string | null; finishedAtUTC: string | null;
  status: "running" | "completed" | "failed"; hostsScanned: number; openPorts: number;
  error: string | null; findings: Finding[];
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

  const [editingFinding, setEditingFinding] = useState<Finding | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const noteMut = useMutation();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  function openNote(f: Finding) {
    setEditingFinding(f);
    setNoteDraft(f.notes ?? "");
  }

  async function saveNote() {
    if (!editingFinding) return;
    const ok = await noteMut.run(async () => {
      await apiPatch(`/scan-runs/${id}/findings/${editingFinding.id}`, { notes: noteDraft || null });
      await refetch();
    });
    if (ok) setEditingFinding(null);
  }

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
        <CardTitle className="mb-3">Findings</CardTitle>
        {data.findings.length === 0 && (
          <Empty title={data.status === "running" ? "Scanning…" : "No open ports found"}>
            {data.status === "completed" && "The scan completed without discovering open TCP ports on the target."}
          </Empty>
        )}
        {data.findings.length > 0 && (
          <Table>
            <thead><tr>
              <Th>IP</Th><Th>Hostname</Th><Th>Port</Th><Th>Proto</Th><Th>State</Th><Th>Service</Th><Th>Notes</Th><Th className="text-right">Actions</Th>
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
                  <Td className="max-w-64 truncate">{f.notes ?? "—"}</Td>
                  <Td className="text-right">
                    <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openNote(f)}>
                      {f.notes ? "Edit note" : "Add note"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <NotesPanel entityType="scan_run" entityId={data.id} />

      <Modal
        open={editingFinding !== null}
        onClose={() => setEditingFinding(null)}
        title={editingFinding ? `Note for ${editingFinding.ipAddress}:${editingFinding.port}` : "Finding note"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingFinding(null)}>Cancel</Button>
            <Button onClick={saveNote} disabled={noteMut.pending}>{noteMut.pending ? "Saving…" : "Save note"}</Button>
          </>
        }
      >
        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Expected service? Action needed? e.g. “Telnet should be disabled — raised hardening item.”"
        />
        {noteMut.error && <p className="mt-2 text-sm text-danger">{noteMut.error}</p>}
      </Modal>
    </div>
  );
}
