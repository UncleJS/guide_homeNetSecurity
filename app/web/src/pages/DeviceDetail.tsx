import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPatch, useApi } from "@/api/client";
import { Button, Card, CardTitle, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { RiskBadge } from "@/components/badges";
import { NotesPanel } from "@/components/NotesPanel";
import { DateTimeInput } from "@/components/DateTimeInput";
import { formatLocal, isoToLocalInput, localToISO } from "@/lib/format";

interface DeviceFull {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number; lastSeenUTC: string | null;
  ips: Array<{ id: number; address: string; assignmentType: string; macAddress: string | null }>;
  ports: Array<{ id: number; port: number; protocol: string; service: string | null }>;
  hardening: Array<{ id: number; control: string; state: string }>;
}

const STATES = ["pending", "done", "na"];

export function DeviceDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi<DeviceFull>(`/devices/${id}`);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [savingSeen, setSavingSeen] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const seenValue = lastSeen ?? isoToLocalInput(data.lastSeenUTC);

  async function toggle(itemId: number, state: string) {
    await apiPatch(`/hardening-items/${itemId}`, { state });
    await refetch();
  }
  async function saveLastSeen() {
    setSavingSeen(true);
    try {
      const iso = seenValue ? localToISO(seenValue) : null;
      await apiPatch(`/devices/${id}`, { lastSeenUTC: iso });
      setLastSeen(null);
      await refetch();
    } finally { setSavingSeen(false); }
  }

  const doneCount = data.hardening.filter((h) => h.state === "done").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/devices" className="text-sm text-primary underline">← Devices</Link>
        <h1 className="text-2xl font-bold text-foreground">{data.hostname}</h1>
        <RiskBadge level={data.riskLevel} />
        {data.isGateway ? <span className="text-xs text-primary">gateway</span> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Details</CardTitle>
          <dl className="grid grid-cols-2 gap-y-2 text-sm text-foreground">
            <dt className="opacity-80">Type</dt><dd>{data.deviceType ?? "—"}</dd>
            <dt className="opacity-80">Vendor</dt><dd>{data.vendor ?? "—"}</dd>
            <dt className="opacity-80">Owner</dt><dd>{data.owner ?? "—"}</dd>
            <dt className="opacity-80">Location</dt><dd>{data.location ?? "—"}</dd>
            <dt className="opacity-80">Firmware</dt><dd>{data.firmwareVersion ?? "—"}</dd>
            <dt className="opacity-80">Last seen</dt><dd>{formatLocal(data.lastSeenUTC)}</dd>
          </dl>
          <div className="mt-4">
            <CardTitle className="mb-2">Update last seen</CardTitle>
            <DateTimeInput value={seenValue} onChange={setLastSeen} />
            <div className="mt-2"><Button onClick={saveLastSeen} disabled={savingSeen}>{savingSeen ? "Saving…" : "Save"}</Button></div>
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-3">Hardening checklist ({doneCount}/{data.hardening.length})</CardTitle>
          <ul className="space-y-2">
            {data.hardening.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <span className="text-sm text-foreground">{h.control}</span>
                <Select value={h.state} onChange={(e) => toggle(h.id, e.target.value)} className="w-28">
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">IP addresses</CardTitle>
          {data.ips.length === 0 ? <p className="text-sm text-foreground opacity-80">No addresses recorded.</p> : (
            <Table>
              <thead><tr><Th>Address</Th><Th>Type</Th><Th>MAC</Th></tr></thead>
              <tbody>
                {data.ips.map((ip) => (
                  <tr key={ip.id}><Td className="font-mono">{ip.address}</Td><Td>{ip.assignmentType}</Td><Td className="font-mono">{ip.macAddress ?? "—"}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-3">Open ports / services</CardTitle>
          {data.ports.length === 0 ? <p className="text-sm text-foreground opacity-80">No ports recorded.</p> : (
            <Table>
              <thead><tr><Th>Port</Th><Th>Proto</Th><Th>Service</Th></tr></thead>
              <tbody>
                {data.ports.map((p) => (
                  <tr key={p.id}><Td className="font-mono">{p.port}</Td><Td>{p.protocol}</Td><Td>{p.service ?? "—"}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <NotesPanel entityType="device" entityId={data.id} />
    </div>
  );
}
