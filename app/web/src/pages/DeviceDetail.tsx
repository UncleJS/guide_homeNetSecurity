import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Field, Input, Modal, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { RiskBadge } from "@/components/badges";
import { NotesPanel } from "@/components/NotesPanel";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Fields, fromRow, toPayload, type DeviceForm } from "@/components/DeviceForm";
import { formatLocal, isoToLocalInput, localToISO } from "@/lib/format";

interface DevicePort {
  id: number; port: number; protocol: string; service: string | null;
  source: "manual" | "scan"; lastSeenAtUTC: string | null;
  ipAddressId: number | null;
}

type DeviceIp = { id: number; address: string; assignmentType: string; macAddress: string | null };

interface DeviceFull {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number; lastSeenUTC: string | null;
  ips: DeviceIp[];
  ports: DevicePort[];
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

type PortForm = { port: string; protocol: string; service: string; ipAddressId: string };

const PORT_FORM_EMPTY: PortForm = { port: "", protocol: "tcp", service: "", ipAddressId: "" };

// Notes are deliberately absent: a port's note is managed solely from the
// IP Addresses drilldown. PATCH is partial, so edits here never clobber it.
const portPayload = (deviceId: number, f: PortForm) => ({
  deviceId,
  ipAddressId: f.ipAddressId ? Number(f.ipAddressId) : null,
  port: Number(f.port),
  protocol: f.protocol,
  service: f.service || null,
});

const portFormFromRow = (p: DevicePort): PortForm => ({
  port: String(p.port),
  protocol: p.protocol,
  service: p.service ?? "",
  ipAddressId: p.ipAddressId != null ? String(p.ipAddressId) : "",
});

function PortFields({ value, set, ips }: { value: PortForm; set: (f: PortForm) => void; ips: DeviceIp[] }) {
  return (
    <div className="grid gap-x-4 md:grid-cols-2">
      <Field label="Port">
        <Input type="number" min={0} max={65535} value={value.port} onChange={(e) => set({ ...value, port: e.target.value })} placeholder="443" className="font-mono" />
      </Field>
      <Field label="Protocol">
        <Select value={value.protocol} onChange={(e) => set({ ...value, protocol: e.target.value })}>
          <option value="tcp">tcp</option>
          <option value="udp">udp</option>
        </Select>
      </Field>
      <Field label="IP address">
        <Select value={value.ipAddressId} onChange={(e) => set({ ...value, ipAddressId: e.target.value })}>
          <option value="">device-wide</option>
          {ips.map((ip) => <option key={ip.id} value={ip.id}>{ip.address}</option>)}
        </Select>
      </Field>
      <Field label="Service (optional)">
        <Input value={value.service} onChange={(e) => set({ ...value, service: e.target.value })} placeholder="https" />
      </Field>
    </div>
  );
}

function PortRows({ ports, onEdit, onArchive }: {
  ports: DevicePort[];
  onEdit: (p: DevicePort) => void;
  onArchive: (p: DevicePort) => void;
}) {
  return (
    <Table>
      <thead><tr><Th>Port</Th><Th>Proto</Th><Th>Service</Th><Th>Source</Th><Th>Last seen</Th><Th className="text-right">Actions</Th></tr></thead>
      <tbody>
        {ports.map((p) => (
          <tr key={p.id}>
            <Td className="font-mono">{p.port}</Td>
            <Td>{p.protocol}</Td>
            <Td>{p.service ?? "—"}</Td>
            <Td><Badge className={p.source === "scan" ? "border-primary" : ""}>{p.source}</Badge></Td>
            <Td>{formatLocal(p.lastSeenAtUTC)}</Td>
            <Td className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => onEdit(p)}>Edit</Button>
                <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => onArchive(p)}>Archive</Button>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function PortsCard({ deviceId, ips, ports, onSaved }: { deviceId: number; ips: DeviceIp[]; ports: DevicePort[]; onSaved: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<PortForm>(PORT_FORM_EMPTY);
  const addMut = useMutation();

  const [editing, setEditing] = useState<DevicePort | null>(null);
  const [editForm, setEditForm] = useState<PortForm>(PORT_FORM_EMPTY);
  const editMut = useMutation();

  const [archiving, setArchiving] = useState<DevicePort | null>(null);
  const archiveMut = useMutation();

  async function create() {
    const ok = await addMut.run(async () => {
      await apiPost("/device-ports", portPayload(deviceId, addForm));
      await onSaved();
    });
    if (ok) {
      setAdding(false);
      setAddForm(PORT_FORM_EMPTY);
    }
  }

  function openEdit(p: DevicePort) {
    setEditing(p);
    setEditForm(portFormFromRow(p));
  }

  async function saveEdit() {
    if (!editing) return;
    const ok = await editMut.run(async () => {
      await apiPatch(`/device-ports/${editing.id}`, portPayload(deviceId, editForm));
      await onSaved();
    });
    if (ok) setEditing(null);
  }

  async function confirmArchive() {
    if (!archiving) return;
    const ok = await archiveMut.run(async () => {
      await apiPost(`/device-ports/${archiving.id}/archive`, {});
      await onSaved();
    });
    if (ok) setArchiving(null);
  }

  // Ports grouped per bound IP, then device-wide; ports bound to a since-
  // released (archived) IP fall into an "Unknown IP" group so they stay visible.
  const groups: Array<{ key: string; label: string; ports: DevicePort[] }> = [];
  for (const ip of ips) {
    const bound = ports.filter((p) => p.ipAddressId === ip.id);
    if (bound.length) groups.push({ key: `ip-${ip.id}`, label: ip.address, ports: bound });
  }
  const knownIpIds = new Set(ips.map((ip) => ip.id));
  const orphanIds = [...new Set(
    ports.filter((p) => p.ipAddressId != null && !knownIpIds.has(p.ipAddressId)).map((p) => p.ipAddressId!),
  )];
  for (const orphanId of orphanIds) {
    groups.push({
      key: `ip-${orphanId}`,
      label: `Unknown IP (#${orphanId})`,
      ports: ports.filter((p) => p.ipAddressId === orphanId),
    });
  }
  const deviceWide = ports.filter((p) => p.ipAddressId == null);
  if (deviceWide.length) groups.push({ key: "device-wide", label: "Device-wide", ports: deviceWide });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle>Open ports / services</CardTitle>
        <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>Add port</Button>
      </div>
      {archiveMut.error && <p className="mb-2 text-sm text-danger">{archiveMut.error}</p>}
      {ports.length === 0 ? <p className="text-sm text-foreground opacity-80">No ports recorded.</p> : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className={`mb-1 text-sm font-medium text-foreground ${g.key.startsWith("ip-") && !g.label.startsWith("Unknown") ? "font-mono" : ""}`}>{g.label}</p>
              <PortRows ports={g.ports} onEdit={openEdit} onArchive={setArchiving} />
            </div>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add port"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={create} disabled={addMut.pending || !addForm.port}>{addMut.pending ? "Saving…" : "Add port"}</Button>
          </>
        }
      >
        <PortFields value={addForm} set={setAddForm} ips={ips} />
        {addMut.error && <p className="text-sm text-danger">{addMut.error}</p>}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.protocol}/${editing.port}` : "Edit port"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editMut.pending || !editForm.port}>{editMut.pending ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <PortFields value={editForm} set={setEditForm} ips={ips} />
        {editMut.error && <p className="text-sm text-danger">{editMut.error}</p>}
      </Modal>

      <Modal
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={archiving ? `Archive ${archiving.protocol}/${archiving.port}?` : "Archive port"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button onClick={confirmArchive} disabled={archiveMut.pending}>{archiveMut.pending ? "Archiving…" : "Archive"}</Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          This removes <span className="font-mono">{archiving?.protocol}/{archiving?.port}</span>
          {archiving?.service ? <> ({archiving.service})</> : null} from the device&apos;s port list.
          It is archived, not deleted.
        </p>
        {archiveMut.error && <p className="mt-2 text-sm text-danger">{archiveMut.error}</p>}
      </Modal>
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
        <PortsCard deviceId={data.id} ips={data.ips} ports={data.ports} onSaved={refetch} />
      </div>

      <NotesPanel entityType="device" entityId={data.id} />
    </div>
  );
}
