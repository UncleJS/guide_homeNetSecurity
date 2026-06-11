import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { DateTimeInput } from "@/components/DateTimeInput";
import { isoToLocalInput, localToISO } from "@/lib/format";

export const RECURRENCES = ["once", "daily", "weekly", "monthly", "quarterly"];
export const PORT_PRESETS = ["top100", "top1000", "custom"];

export type ScheduleForm = {
  name: string; targetType: "subnet" | "device"; subnetId: string; deviceId: string;
  portPreset: string; customPorts: string; recurrence: string; nextRunLocal: string;
  enabled: boolean; reminderMinutes: string; reminderEmail: string; description: string;
};

export const EMPTY: ScheduleForm = {
  name: "", targetType: "subnet", subnetId: "", deviceId: "",
  portPreset: "top100", customPorts: "", recurrence: "once", nextRunLocal: "",
  enabled: true, reminderMinutes: "", reminderEmail: "", description: "",
};

export function toPayload(f: ScheduleForm) {
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

export interface ScheduleFormSource {
  name: string; targetType: "subnet" | "device";
  subnetId: number | null; deviceId: number | null;
  portSpec: string; recurrence: string; nextRunAtUTC: string;
  enabled: number; reminderMinutesBefore: number | null; reminderEmail: string | null;
  description: string | null;
}

export function fromRow(s: ScheduleFormSource): ScheduleForm {
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

export function formReady(f: ScheduleForm): boolean {
  if (!f.name || !f.nextRunLocal) return false;
  if (f.targetType === "subnet" && !f.subnetId) return false;
  if (f.targetType === "device" && !f.deviceId) return false;
  if (f.portPreset === "custom" && !f.customPorts) return false;
  return true;
}

export function Fields({
  form, setForm, subnets, devices,
}: {
  form: ScheduleForm; setForm: (f: ScheduleForm) => void;
  subnets: { id: number; name: string; cidr: string }[];
  devices: { id: number; hostname: string }[];
}) {
  return (
    <>
      <div className="grid gap-x-4 md:grid-cols-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly IoT sweep" /></Field>
        <Field label="Target type">
          <Select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as ScheduleForm["targetType"] })}>
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
