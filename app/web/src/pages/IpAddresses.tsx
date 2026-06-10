import { useState } from "react";
import { apiPost, useApi } from "@/api/client";
import { Button, Card, CardTitle, Field, Input, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";

const TYPES = ["static", "dhcp", "reserved"];

interface Subnet { id: number; name: string; cidr: string }
interface Device { id: number; hostname: string }
interface Ip {
  id: number; subnetId: number; deviceId: number | null; address: string;
  assignmentType: string; macAddress: string | null; status: string;
}

export function IpAddresses() {
  const subnets = useApi<{ data: Subnet[] }>("/subnets");
  const devices = useApi<{ data: Device[] }>("/devices?pageSize=200");
  const ips = useApi<{ data: Ip[] }>("/ip-addresses?pageSize=200");
  const [form, setForm] = useState({ subnetId: "", deviceId: "", address: "", assignmentType: "dhcp", macAddress: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subnetName = (id: number) => subnets.data?.data.find((s) => s.id === id)?.name ?? `#${id}`;
  const deviceName = (id: number | null) => id ? (devices.data?.data.find((d) => d.id === id)?.hostname ?? `#${id}`) : "—";

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/ip-addresses", {
        subnetId: Number(form.subnetId),
        deviceId: form.deviceId ? Number(form.deviceId) : null,
        address: form.address, assignmentType: form.assignmentType,
        macAddress: form.macAddress || null,
      });
      setForm({ subnetId: form.subnetId, deviceId: "", address: "", assignmentType: "dhcp", macAddress: "" });
      await ips.refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to allocate");
    } finally { setSaving(false); }
  }

  const loading = subnets.loading || devices.loading || ips.loading;
  const error = subnets.error || devices.error || ips.error;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">IP Addresses</h1>

      <Card>
        <CardTitle className="mb-3">Allocate an address</CardTitle>
        <div className="grid gap-x-4 md:grid-cols-3">
          <Field label="Subnet">
            <Select value={form.subnetId} onChange={(e) => setForm({ ...form, subnetId: e.target.value })}>
              <option value="">select…</option>
              {subnets.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>)}
            </Select>
          </Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="192.168.20.50" className="font-mono" /></Field>
          <Field label="Assignment">
            <Select value={form.assignmentType} onChange={(e) => setForm({ ...form, assignmentType: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Device (optional)">
            <Select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>
              <option value="">unassigned</option>
              {devices.data?.data.map((d) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
            </Select>
          </Field>
          <Field label="MAC (optional)"><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} placeholder="aa:bb:cc:00:00:01" className="font-mono" /></Field>
        </div>
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.subnetId || !form.address}>{saving ? "Saving…" : "Allocate"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={ips.refetch} />}
      {ips.data && ips.data.data.length === 0 && <Empty title="No IP allocations yet">Allocate addresses to track static/DHCP/reserved usage.</Empty>}
      {ips.data && ips.data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Address</Th><Th>Subnet</Th><Th>Type</Th><Th>Device</Th><Th>MAC</Th></tr></thead>
          <tbody>
            {ips.data.data.map((ip) => (
              <tr key={ip.id}>
                <Td className="font-mono">{ip.address}</Td>
                <Td>{subnetName(ip.subnetId)}</Td>
                <Td>{ip.assignmentType}</Td>
                <Td>{deviceName(ip.deviceId)}</Td>
                <Td className="font-mono">{ip.macAddress ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
