import { useState } from "react";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import {
  Button, Card, CardTitle, Checkbox, Field, Input, Modal, Select,
} from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { IpPortsTable, type IpRow } from "@/components/IpPortsTable";

const TYPES = ["static", "dhcp", "reserved"];

interface Subnet { id: number; name: string; cidr: string }
interface Device { id: number; hostname: string }
type Ip = IpRow;

type Form = {
  subnetId: string; deviceId: string; address: string;
  assignmentType: string; macAddress: string; status: string;
};

const EMPTY: Form = { subnetId: "", deviceId: "", address: "", assignmentType: "dhcp", macAddress: "", status: "active" };

const toPayload = (f: Form) => ({
  subnetId: Number(f.subnetId),
  deviceId: f.deviceId ? Number(f.deviceId) : null,
  address: f.address,
  assignmentType: f.assignmentType,
  macAddress: f.macAddress || null,
  status: f.status || "active",
});

const fromRow = (ip: Ip): Form => ({
  subnetId: String(ip.subnetId),
  deviceId: ip.deviceId != null ? String(ip.deviceId) : "",
  address: ip.address,
  assignmentType: ip.assignmentType,
  macAddress: ip.macAddress ?? "",
  status: ip.status ?? "active",
});

function Fields({
  value, set, subnets, devices,
}: { value: Form; set: (f: Form) => void; subnets: Subnet[]; devices: Device[] }) {
  return (
    <div className="grid gap-x-4 md:grid-cols-3">
      <Field label="Subnet">
        <Select value={value.subnetId} onChange={(e) => set({ ...value, subnetId: e.target.value })}>
          <option value="">select…</option>
          {subnets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
        </Select>
      </Field>
      <Field label="Address"><Input value={value.address} onChange={(e) => set({ ...value, address: e.target.value })} placeholder="192.168.20.50" className="font-mono" /></Field>
      <Field label="Assignment">
        <Select value={value.assignmentType} onChange={(e) => set({ ...value, assignmentType: e.target.value })}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Device (optional)">
        <Select value={value.deviceId} onChange={(e) => set({ ...value, deviceId: e.target.value })}>
          <option value="">unassigned</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
        </Select>
      </Field>
      <Field label="MAC (optional)"><Input value={value.macAddress} onChange={(e) => set({ ...value, macAddress: e.target.value })} placeholder="aa:bb:cc:00:00:01" className="font-mono" /></Field>
      <Field label="Status"><Input value={value.status} onChange={(e) => set({ ...value, status: e.target.value })} placeholder="active" /></Field>
    </div>
  );
}

export function IpAddresses() {
  const [showArchived, setShowArchived] = useState(false);
  const subnets = useApi<{ data: Subnet[] }>("/subnets?pageSize=200");
  const devices = useApi<{ data: Device[] }>("/devices?pageSize=200");
  const ips = useApi<{ data: Ip[] }>(
    `/ip-addresses?pageSize=200${showArchived ? "&includeArchived=true" : ""}`,
  );
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Ip | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const subnetName = (id: number) => subnets.data?.data.find((s) => s.id === id)?.name ?? `#${id}`;
  const deviceName = (id: number | null) => id ? (devices.data?.data.find((d) => d.id === id)?.hostname ?? `#${id}`) : "—";
  const subnetList = subnets.data?.data ?? [];
  const deviceList = devices.data?.data ?? [];

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/ip-addresses", toPayload(form));
      setForm({ ...EMPTY, subnetId: form.subnetId });
      await ips.refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to allocate");
    } finally { setSaving(false); }
  }

  function openEdit(ip: Ip) {
    setEditing(ip); setEditForm(fromRow(ip)); setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditError(null);
    try {
      await apiPatch(`/ip-addresses/${editing.id}`, toPayload(editForm));
      setEditing(null);
      await ips.refetch();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally { setEditSaving(false); }
  }

  const rowMut = useMutation();
  const [releasing, setReleasing] = useState<Ip | null>(null);
  async function confirmRelease() {
    if (!releasing) return;
    const ok = await rowMut.run(async () => {
      await apiPost(`/ip-addresses/${releasing.id}/archive`, {});
      await ips.refetch();
    });
    if (ok) setReleasing(null);
  }
  const restore = (id: number) => rowMut.run(async () => {
    await apiPost(`/ip-addresses/${id}/restore`, {});
    await ips.refetch();
  });

  const loading = subnets.loading || devices.loading || ips.loading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">IP Addresses</h1>
        <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
      </div>

      <Card>
        <CardTitle className="mb-3">Allocate an address</CardTitle>
        <Fields value={form} set={setForm} subnets={subnetList} devices={deviceList} />
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.subnetId || !form.address}>{saving ? "Saving…" : "Allocate"}</Button>
      </Card>

      {loading && <Loading />}
      {subnets.error && <ErrorState message={`Subnets: ${subnets.error}`} onRetry={subnets.refetch} />}
      {devices.error && <ErrorState message={`Devices: ${devices.error}`} onRetry={devices.refetch} />}
      {ips.error && <ErrorState message={`IP addresses: ${ips.error}`} onRetry={ips.refetch} />}
      {rowMut.error && <p className="text-sm text-danger">{rowMut.error}</p>}
      {ips.data && ips.data.data.length === 0 && <Empty title="No IP allocations yet">Allocate addresses to track static/DHCP/reserved usage.</Empty>}
      {ips.data && ips.data.data.length > 0 && (
        <IpPortsTable
          ips={ips.data.data}
          subnetName={subnetName}
          deviceName={deviceName}
          renderActions={(ip) => (
            <div className="flex justify-end gap-2">
              {ip.archivedAtUTC != null ? (
                <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => restore(ip.id)}>Unarchive</Button>
              ) : (
                <>
                  <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(ip)}>Edit</Button>
                  <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setReleasing(ip)}>Release</Button>
                </>
              )}
            </div>
          )}
        />
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.address}` : "Edit IP"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editForm.subnetId || !editForm.address}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <Fields value={editForm} set={setEditForm} subnets={subnetList} devices={deviceList} />
        {editError && <p className="text-sm text-danger">{editError}</p>}
      </Modal>

      <Modal
        open={releasing !== null}
        onClose={() => setReleasing(null)}
        title={releasing ? `Release ${releasing.address}?` : "Release IP"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReleasing(null)}>Cancel</Button>
            <Button onClick={confirmRelease} disabled={rowMut.pending}>{rowMut.pending ? "Releasing…" : "Release"}</Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          This releases the allocation for <span className="font-mono">{releasing?.address}</span>
          {releasing?.deviceId != null ? <> (assigned to {deviceName(releasing.deviceId)})</> : null}.
          It is archived, not deleted — restore it any time via “Show archived”.
        </p>
        {rowMut.error && <p className="mt-2 text-sm text-danger">{rowMut.error}</p>}
      </Modal>
    </div>
  );
}
