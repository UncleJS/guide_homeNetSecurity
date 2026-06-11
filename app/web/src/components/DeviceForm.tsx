import { Field, Input, Select } from "@/components/ui";

export const RISKS = ["low", "medium", "high", "critical"];

export type DeviceForm = {
  hostname: string; deviceType: string; vendor: string; owner: string;
  location: string; firmwareVersion: string; riskLevel: string; isGateway: boolean;
};

export const EMPTY: DeviceForm = { hostname: "", deviceType: "", vendor: "", owner: "", location: "", firmwareVersion: "", riskLevel: "low", isGateway: false };

export const toPayload = (f: DeviceForm) => ({
  hostname: f.hostname,
  deviceType: f.deviceType || null,
  vendor: f.vendor || null,
  owner: f.owner || null,
  location: f.location || null,
  firmwareVersion: f.firmwareVersion || null,
  riskLevel: f.riskLevel,
  isGateway: f.isGateway ? 1 : 0,
});

export interface DeviceFormSource {
  hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number;
}

export const fromRow = (d: DeviceFormSource): DeviceForm => ({
  hostname: d.hostname,
  deviceType: d.deviceType ?? "",
  vendor: d.vendor ?? "",
  owner: d.owner ?? "",
  location: d.location ?? "",
  firmwareVersion: d.firmwareVersion ?? "",
  riskLevel: d.riskLevel,
  isGateway: d.isGateway === 1,
});

export function Fields({ form, setForm }: { form: DeviceForm; setForm: (f: DeviceForm) => void }) {
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
