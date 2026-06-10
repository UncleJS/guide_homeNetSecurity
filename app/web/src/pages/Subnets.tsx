import { useState } from "react";
import { apiPatch, apiPost, useApi } from "@/api/client";
import {
  Button, Card, CardTitle, Checkbox, Field, Input, Modal, Select, Table, Th, Td, Textarea,
} from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { ZoneBadge } from "@/components/badges";

const ZONES = ["mgmt", "trusted", "work", "iot", "guest"];

interface Subnet {
  id: number; name: string; cidr: string; vlanId: number | null;
  trustZone: string; gateway: string | null; dnsServers: string | null;
  description: string | null; archivedAtUTC: string | null;
}

type Form = {
  name: string; cidr: string; vlanId: string; trustZone: string;
  gateway: string; dnsServers: string; description: string;
};

const EMPTY: Form = { name: "", cidr: "", vlanId: "", trustZone: "trusted", gateway: "", dnsServers: "", description: "" };

const toPayload = (f: Form) => ({
  name: f.name, cidr: f.cidr,
  vlanId: f.vlanId ? Number(f.vlanId) : null,
  trustZone: f.trustZone,
  gateway: f.gateway || null,
  dnsServers: f.dnsServers || null,
  description: f.description || null,
});

const fromRow = (s: Subnet): Form => ({
  name: s.name, cidr: s.cidr,
  vlanId: s.vlanId != null ? String(s.vlanId) : "",
  trustZone: s.trustZone,
  gateway: s.gateway ?? "",
  dnsServers: s.dnsServers ?? "",
  description: s.description ?? "",
});

function Fields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <>
      <div className="grid gap-x-4 md:grid-cols-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Trusted LAN" /></Field>
        <Field label="CIDR"><Input value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} placeholder="192.168.20.0/24" className="font-mono" /></Field>
        <Field label="VLAN ID"><Input value={form.vlanId} onChange={(e) => setForm({ ...form, vlanId: e.target.value })} placeholder="20" inputMode="numeric" /></Field>
        <Field label="Trust zone">
          <Select value={form.trustZone} onChange={(e) => setForm({ ...form, trustZone: e.target.value })}>
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        <Field label="Gateway"><Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="192.168.20.1" className="font-mono" /></Field>
        <Field label="DNS servers"><Input value={form.dnsServers} onChange={(e) => setForm({ ...form, dnsServers: e.target.value })} placeholder="192.168.20.2" className="font-mono" /></Field>
      </div>
      <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes about this network" /></Field>
    </>
  );
}

export function Subnets() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, error, refetch } = useApi<{ data: Subnet[] }>(
    `/subnets?pageSize=200${showArchived ? "&includeArchived=true" : ""}`,
  );
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Subnet | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/subnets", toPayload(form));
      setForm(EMPTY);
      await refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  function openEdit(s: Subnet) {
    setEditing(s); setEditForm(fromRow(s)); setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditError(null);
    try {
      await apiPatch(`/subnets/${editing.id}`, toPayload(editForm));
      setEditing(null);
      await refetch();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally { setEditSaving(false); }
  }

  async function archive(id: number) {
    await apiPost(`/subnets/${id}/archive`, {});
    await refetch();
  }
  async function restore(id: number) {
    await apiPost(`/subnets/${id}/restore`, {});
    await refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Subnets / VLANs</h1>
        <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
      </div>

      <Card>
        <CardTitle className="mb-3">Add a subnet</CardTitle>
        <Fields form={form} setForm={setForm} />
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.name || !form.cidr}>{saving ? "Saving…" : "Add subnet"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <Empty title="No subnets yet">Add your first network above (start with your trusted LAN).</Empty>}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>CIDR</Th><Th>VLAN</Th><Th>Zone</Th><Th>Gateway</Th><Th>DNS</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.data.map((s) => {
              const archived = s.archivedAtUTC != null;
              return (
                <tr key={s.id} className={archived ? "opacity-60" : undefined}>
                  <Td>{s.name}{archived && <span className="ml-2 text-xs text-foreground opacity-70">(archived)</span>}</Td>
                  <Td className="font-mono">{s.cidr}</Td>
                  <Td>{s.vlanId ?? "—"}</Td>
                  <Td><ZoneBadge zone={s.trustZone} /></Td>
                  <Td className="font-mono">{s.gateway ?? "—"}</Td>
                  <Td className="font-mono">{s.dnsServers ?? "—"}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {archived ? (
                        <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => restore(s.id)}>Unarchive</Button>
                      ) : (
                        <>
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(s)}>Edit</Button>
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => archive(s.id)}>Archive</Button>
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
        title={editing ? `Edit ${editing.name}` : "Edit subnet"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editForm.name || !editForm.cidr}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <Fields form={editForm} setForm={setEditForm} />
        {editError && <p className="text-sm text-danger">{editError}</p>}
      </Modal>
    </div>
  );
}
