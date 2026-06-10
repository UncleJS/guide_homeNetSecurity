import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import {
  Button, Card, CardTitle, Checkbox, Field, Input, Modal, Select, Table, Th, Td,
} from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { RiskBadge } from "@/components/badges";

const RISKS = ["low", "medium", "high", "critical"];

interface Device {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number; archivedAtUTC: string | null;
}

type Form = {
  hostname: string; deviceType: string; vendor: string; owner: string;
  location: string; firmwareVersion: string; riskLevel: string; isGateway: boolean;
};

const EMPTY: Form = { hostname: "", deviceType: "", vendor: "", owner: "", location: "", firmwareVersion: "", riskLevel: "low", isGateway: false };

const toPayload = (f: Form) => ({
  hostname: f.hostname,
  deviceType: f.deviceType || null,
  vendor: f.vendor || null,
  owner: f.owner || null,
  location: f.location || null,
  firmwareVersion: f.firmwareVersion || null,
  riskLevel: f.riskLevel,
  isGateway: f.isGateway ? 1 : 0,
});

const fromRow = (d: Device): Form => ({
  hostname: d.hostname,
  deviceType: d.deviceType ?? "",
  vendor: d.vendor ?? "",
  owner: d.owner ?? "",
  location: d.location ?? "",
  firmwareVersion: d.firmwareVersion ?? "",
  riskLevel: d.riskLevel,
  isGateway: d.isGateway === 1,
});

function Fields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <>
      <div className="grid gap-x-4 md:grid-cols-3">
        <Field label="Hostname"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="thinkpad" /></Field>
        <Field label="Type"><Input value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} placeholder="laptop / camera / nas" /></Field>
        <Field label="Vendor"><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Lenovo" /></Field>
        <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="you" /></Field>
        <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="office" /></Field>
        <Field label="Firmware"><Input value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} placeholder="1.2.3" /></Field>
        <Field label="Risk">
          <Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
            {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={form.isGateway} onChange={(e) => setForm({ ...form, isGateway: e.target.checked })} />
        Acts as a gateway / uplink root (shown at the top of the network map)
      </label>
    </>
  );
}

export function Devices() {
  const [riskFilter, setRiskFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const params = new URLSearchParams({ pageSize: "200" });
  if (riskFilter) params.set("riskLevel", riskFilter);
  if (showArchived) params.set("includeArchived", "true");
  const { data, loading, error, refetch } = useApi<{ data: Device[] }>(`/devices?${params.toString()}`);

  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Device | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/devices", toPayload(form));
      setForm(EMPTY);
      await refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  function openEdit(d: Device) {
    setEditing(d); setEditForm(fromRow(d)); setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditError(null);
    try {
      await apiPatch(`/devices/${editing.id}`, toPayload(editForm));
      setEditing(null);
      await refetch();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally { setEditSaving(false); }
  }

  const rowMut = useMutation();
  const archive = (id: number) => rowMut.run(async () => {
    await apiPost(`/devices/${id}/archive`, {});
    await refetch();
  });
  const restore = (id: number) => rowMut.run(async () => {
    await apiPost(`/devices/${id}/restore`, {});
    await refetch();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Devices</h1>
        <div className="flex items-center gap-4">
          <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Filter risk:</span>
            <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="w-36">
              <option value="">all</option>
              {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardTitle className="mb-3">Add a device</CardTitle>
        <Fields form={form} setForm={setForm} />
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.hostname}>{saving ? "Saving…" : "Add device"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {rowMut.error && <p className="text-sm text-danger">{rowMut.error}</p>}
      {data && data.data.length === 0 && <Empty title="No devices yet">Add devices from your scan/inventory (chapter 03).</Empty>}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Hostname</Th><Th>Type</Th><Th>Vendor</Th><Th>Owner</Th><Th>Risk</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.data.map((d) => {
              const archived = d.archivedAtUTC != null;
              return (
                <tr key={d.id} className={archived ? "opacity-60" : undefined}>
                  <Td>
                    {d.hostname}
                    {d.isGateway ? <span className="ml-2 text-xs text-primary">gateway</span> : null}
                    {archived && <span className="ml-2 text-xs text-foreground opacity-70">(archived)</span>}
                  </Td>
                  <Td>{d.deviceType ?? "—"}</Td>
                  <Td>{d.vendor ?? "—"}</Td>
                  <Td>{d.owner ?? "—"}</Td>
                  <Td><RiskBadge level={d.riskLevel} /></Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {archived ? (
                        <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => restore(d.id)}>Unarchive</Button>
                      ) : (
                        <>
                          <Link className="text-sm text-primary underline" to={`/devices/${d.id}`}>open</Link>
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(d)}>Edit</Button>
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => archive(d.id)}>Archive</Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.hostname}` : "Edit device"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editForm.hostname}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <Fields form={editForm} setForm={setEditForm} />
        {editError && <p className="text-sm text-danger">{editError}</p>}
      </Modal>
    </div>
  );
}
