import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import {
  Badge, Button, Card, CardTitle, Checkbox, Field, Input, Modal, Select, Table, Th, Td, Textarea,
} from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { DateTimeInput } from "@/components/DateTimeInput";
import { formatLocal, isoToLocalInput, localToISO } from "@/lib/format";

const RECURRENCES = ["once", "daily", "weekly", "monthly", "quarterly"];
const PORT_PRESETS = ["top100", "top1000", "custom"];

export interface Schedule {
  id: number; name: string; targetType: "subnet" | "device";
  subnetId: number | null; deviceId: number | null;
  portSpec: string; recurrence: string; nextRunAtUTC: string;
  enabled: number; reminderMinutesBefore: number | null; reminderEmail: string | null;
  description: string | null; archivedAtUTC: string | null;
  lastRunStatus: string | null; lastRunAtUTC: string | null;
}

export const RUN_STATUS_CLASS: Record<string, string> = {
  running: "border-warning",
  completed: "border-success",
  failed: "border-danger",
};

type Form = {
  name: string; targetType: "subnet" | "device"; subnetId: string; deviceId: string;
  portPreset: string; customPorts: string; recurrence: string; nextRunLocal: string;
  enabled: boolean; reminderMinutes: string; reminderEmail: string; description: string;
};

const EMPTY: Form = {
  name: "", targetType: "subnet", subnetId: "", deviceId: "",
  portPreset: "top100", customPorts: "", recurrence: "once", nextRunLocal: "",
  enabled: true, reminderMinutes: "", reminderEmail: "", description: "",
};

function toPayload(f: Form) {
  return {
    name: f.name,
    targetType: f.targetType,
    subnetId: f.targetType === "subnet" && f.subnetId ? Number(f.subnetId) : null,
    deviceId: f.targetType === "device" && f.deviceId ? Number(f.deviceId) : null,
    portSpec: f.portPreset === "custom" ? f.customPorts : f.portPreset,
    recurrence: f.recurrence,
    nextRunAtUTC: localToISO(f.nextRunLocal) ?? "",
    enabled: f.enabled ? 1 : 0,
    reminderMinutesBefore: f.reminderMinutes ? Number(f.reminderMinutes) : null,
    reminderEmail: f.reminderEmail || null,
    description: f.description || null,
  };
}

function fromRow(s: Schedule): Form {
  const preset = s.portSpec === "top100" || s.portSpec === "top1000" ? s.portSpec : "custom";
  return {
    name: s.name,
    targetType: s.targetType,
    subnetId: s.subnetId != null ? String(s.subnetId) : "",
    deviceId: s.deviceId != null ? String(s.deviceId) : "",
    portPreset: preset,
    customPorts: preset === "custom" ? s.portSpec : "",
    recurrence: s.recurrence,
    nextRunLocal: isoToLocalInput(s.nextRunAtUTC),
    enabled: s.enabled === 1,
    reminderMinutes: s.reminderMinutesBefore != null ? String(s.reminderMinutesBefore) : "",
    reminderEmail: s.reminderEmail ?? "",
    description: s.description ?? "",
  };
}

function formReady(f: Form): boolean {
  if (!f.name || !f.nextRunLocal) return false;
  if (f.targetType === "subnet" && !f.subnetId) return false;
  if (f.targetType === "device" && !f.deviceId) return false;
  if (f.portPreset === "custom" && !f.customPorts) return false;
  return true;
}

function Fields({
  form, setForm, subnets, devices,
}: {
  form: Form; setForm: (f: Form) => void;
  subnets: { id: number; name: string; cidr: string }[];
  devices: { id: number; hostname: string }[];
}) {
  return (
    <>
      <div className="grid gap-x-4 md:grid-cols-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly IoT sweep" /></Field>
        <Field label="Target type">
          <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as Form["targetType"] })}>
            <option value="subnet">subnet</option>
            <option value="device">device</option>
          </Select>
        </Field>
        {form.targetType === "subnet" ? (
          <Field label="Subnet">
            <Select value={form.subnetId} onChange={(e) => setForm({ ...form, subnetId: e.target.value })}>
              <option value="">— pick a subnet —</option>
              {subnets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Device">
            <Select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>
              <option value="">— pick a device —</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Ports">
          <Select value={form.portPreset} onChange={(e) => setForm({ ...form, portPreset: e.target.value })}>
            {PORT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        {form.portPreset === "custom" && (
          <Field label="Custom ports (nmap -p)">
            <Input value={form.customPorts} onChange={(e) => setForm({ ...form, customPorts: e.target.value })} placeholder="1-1024 or 22,80,443" className="font-mono" />
          </Field>
        )}
        <Field label="Recurrence">
          <Select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
            {RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Next run (your local time)">
        <DateTimeInput value={form.nextRunLocal} onChange={(v) => setForm({ ...form, nextRunLocal: v })} />
      </Field>
      <div className="grid gap-x-4 md:grid-cols-3">
        <Field label="Reminder (minutes before, blank = off)">
          <Input value={form.reminderMinutes} onChange={(e) => setForm({ ...form, reminderMinutes: e.target.value })} placeholder="30" inputMode="numeric" />
        </Field>
        <Field label="Reminder email">
          <Input value={form.reminderEmail} onChange={(e) => setForm({ ...form, reminderEmail: e.target.value })} placeholder="you@example.com" />
        </Field>
        <div className="mt-6">
          <Checkbox label="Enabled" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
        </div>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this scan covers, and why (subnet sweeps can miss fully-firewalled hosts; device scans use -Pn)" />
      </Field>
    </>
  );
}

export function Schedules() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, loading, error, refetch } = useApi<{ data: Schedule[] }>(
    `/schedules?pageSize=200${showArchived ? "&includeArchived=true" : ""}`,
  );
  const { data: subnetData } = useApi<{ data: { id: number; name: string; cidr: string }[] }>("/subnets?pageSize=200");
  const { data: deviceData } = useApi<{ data: { id: number; hostname: string }[] }>("/devices?pageSize=200");
  const subnets = subnetData?.data ?? [];
  const devices = deviceData?.data ?? [];
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Schedule | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/schedules", toPayload(form));
      setForm(EMPTY);
      await refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  function openEdit(s: Schedule) {
    setEditing(s); setEditForm(fromRow(s)); setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditError(null);
    try {
      await apiPatch(`/schedules/${editing.id}`, toPayload(editForm));
      setEditing(null);
      await refetch();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally { setEditSaving(false); }
  }

  const rowMut = useMutation();
  const archive = (id: number) => rowMut.run(async () => {
    await apiPost(`/schedules/${id}/archive`, {});
    await refetch();
  });
  const restore = (id: number) => rowMut.run(async () => {
    await apiPost(`/schedules/${id}/restore`, {});
    await refetch();
  });
  const runNow = (id: number) => rowMut.run(async () => {
    const run = await apiPost<{ id: number }>(`/schedules/${id}/run-now`, {});
    navigate(`/runs/${run.id}`);
  });

  function targetLabel(s: Schedule): string {
    if (s.targetType === "subnet") {
      const sn = subnets.find((x) => x.id === s.subnetId);
      return sn ? `${sn.name} (${sn.cidr})` : `subnet #${s.subnetId}`;
    }
    const dev = devices.find((x) => x.id === s.deviceId);
    return dev ? dev.hostname : `device #${s.deviceId}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Scan Schedules</h1>
        <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
      </div>

      <Card>
        <CardTitle className="mb-3">Add a schedule</CardTitle>
        <Fields form={form} setForm={setForm} subnets={subnets} devices={devices} />
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !formReady(form)}>{saving ? "Saving…" : "Add schedule"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {rowMut.error && <p className="text-sm text-danger">{rowMut.error}</p>}
      {data && data.data.length === 0 && (
        <Empty title="No scan schedules yet">Plan your first scan above — e.g. a weekly sweep of the IoT subnet.</Empty>
      )}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr>
            <Th>Name</Th><Th>Target</Th><Th>Ports</Th><Th>Recurrence</Th>
            <Th>Next run</Th><Th>Last run</Th><Th>Reminder</Th><Th>Enabled</Th>
            <Th className="text-right">Actions</Th>
          </tr></thead>
          <tbody>
            {data.data.map((s) => {
              const archived = s.archivedAtUTC != null;
              return (
                <tr key={s.id} className={archived ? "opacity-60" : undefined}>
                  <Td>
                    <Link to={`/schedules/${s.id}`} className="text-foreground underline-offset-2 hover:underline">{s.name}</Link>
                    {archived && <span className="ml-2 text-xs text-foreground opacity-70">(archived)</span>}
                  </Td>
                  <Td>{targetLabel(s)}</Td>
                  <Td className="font-mono">{s.portSpec}</Td>
                  <Td>{s.recurrence}</Td>
                  <Td>{formatLocal(s.nextRunAtUTC)}</Td>
                  <Td>
                    {s.lastRunStatus
                      ? <Badge className={RUN_STATUS_CLASS[s.lastRunStatus]}>{s.lastRunStatus}</Badge>
                      : "—"}
                  </Td>
                  <Td>{s.reminderMinutesBefore != null && s.reminderEmail ? `${s.reminderMinutesBefore} min → ${s.reminderEmail}` : "—"}</Td>
                  <Td>{s.enabled === 1 ? <Badge className="border-success">on</Badge> : <Badge>off</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {archived ? (
                        <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => restore(s.id)}>Unarchive</Button>
                      ) : (
                        <>
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => runNow(s.id)}>Run now</Button>
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
        title={editing ? `Edit ${editing.name}` : "Edit schedule"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !formReady(editForm)}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <Fields form={editForm} setForm={setEditForm} subnets={subnets} devices={devices} />
        {editError && <p className="text-sm text-danger">{editError}</p>}
      </Modal>
    </div>
  );
}
