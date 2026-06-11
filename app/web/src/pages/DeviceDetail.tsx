import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPatch, useApi, useMutation } from "@/api/client";
import { Button, Card, CardTitle, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { RiskBadge } from "@/components/badges";
import { NotesPanel } from "@/components/NotesPanel";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Fields, fromRow, toPayload, type DeviceForm } from "@/components/DeviceForm";
import { isoToLocalInput, localToISO } from "@/lib/format";

interface DeviceFull {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number; lastSeenUTC: string | null;
  ips: Array<{ id: number; address: string; assignmentType: string; macAddress: string | null }>;
  ports: Array<{ id: number; port: number; protocol: string; service: string | null }>;
  hardening: Array<{ id: number; control: string; state: string }>;
}

const STATES = ["pending", "done", "na"];

function DetailsCard({ device, onSaved }: { device: DeviceFull; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<DeviceForm>(fromRow(device));
  const saveMut = useMutation();
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const seenMut = useMutation();
  const seenValue = lastSeen ?? isoToLocalInput(device.lastSeenUTC);

  const save = () => saveMut.run(async () => {
    await apiPatch(`/devices/${device.id}`, toPayload(form));
    await onSaved();
  });

  async function saveLastSeen() {
    const ok = await seenMut.run(async () => {
      const iso = seenValue ? localToISO(seenValue) : null;
      await apiPatch(`/devices/${device.id}`, { lastSeenUTC: iso });
      await onSaved();
    });
    if (ok) setLastSeen(null);
  }

  return (
    <Card>
      <CardTitle className="mb-3">Details</CardTitle>
      <Fields form={form} setForm={setForm} />
      {saveMut.error && <p className="mb-2 text-sm text-danger">{saveMut.error}</p>}
      <Button onClick={save} disabled={saveMut.pending || !form.hostname}>{saveMut.pending ? "Saving…" : "Save changes"}</Button>
      <div className="mt-4">
        <CardTitle className="mb-2">Update last seen</CardTitle>
        <DateTimeInput value={seenValue} onChange={setLastSeen} />
        {seenMut.error && <p className="mt-2 text-sm text-danger">{seenMut.error}</p>}
        <div className="mt-2"><Button onClick={saveLastSeen} disabled={seenMut.pending}>{seenMut.pending ? "Saving…" : "Save"}</Button></div>
      </div>
    </Card>
  );
}

export function DeviceDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi<DeviceFull>(`/devices/${id}`);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const toggleMut = useMutation();

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  async function toggle(itemId: number, state: string) {
    setTogglingId(itemId);
    try {
      await toggleMut.run(async () => {
        await apiPatch(`/hardening-items/${itemId}`, { state });
        await refetch();
      });
    } finally { setTogglingId(null); }
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
        <DetailsCard key={data.id} device={data} onSaved={refetch} />

        <Card>
          <CardTitle className="mb-3">Hardening checklist ({doneCount}/{data.hardening.length})</CardTitle>
          {toggleMut.error && <p className="mb-2 text-sm text-danger">{toggleMut.error}</p>}
          <ul className="space-y-2">
            {data.hardening.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <span className="text-sm text-foreground">{h.control}</span>
                <Select value={h.state} onChange={(e) => toggle(h.id, e.target.value)} disabled={togglingId === h.id} className="w-28">
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
