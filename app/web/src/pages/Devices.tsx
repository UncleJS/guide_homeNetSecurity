import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost, useApi } from "@/api/client";
import { Button, Card, CardTitle, Field, Input, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { RiskBadge } from "@/components/badges";

const RISKS = ["low", "medium", "high", "critical"];

interface Device {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; riskLevel: string; isGateway: number;
}

export function Devices() {
  const [riskFilter, setRiskFilter] = useState("");
  const path = `/devices${riskFilter ? `?riskLevel=${riskFilter}` : ""}`;
  const { data, loading, error, refetch } = useApi<{ data: Device[] }>(path);
  const [form, setForm] = useState({ hostname: "", deviceType: "", vendor: "", owner: "", location: "", riskLevel: "low", isGateway: false });
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await apiPost("/devices", {
        hostname: form.hostname, deviceType: form.deviceType || null, vendor: form.vendor || null,
        owner: form.owner || null, location: form.location || null,
        riskLevel: form.riskLevel, isGateway: form.isGateway ? 1 : 0,
      });
      setForm({ hostname: "", deviceType: "", vendor: "", owner: "", location: "", riskLevel: "low", isGateway: false });
      await refetch();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Devices</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">Filter risk:</span>
          <Select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="w-36">
            <option value="">all</option>
            {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
      </div>

      <Card>
        <CardTitle className="mb-3">Add a device</CardTitle>
        <div className="grid gap-x-4 md:grid-cols-3">
          <Field label="Hostname"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="thinkpad" /></Field>
          <Field label="Type"><Input value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} placeholder="laptop / camera / nas" /></Field>
          <Field label="Vendor"><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Lenovo" /></Field>
          <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="you" /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="office" /></Field>
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
        <Button onClick={create} disabled={saving || !form.hostname}>{saving ? "Saving…" : "Add device"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <Empty title="No devices yet">Add devices from your scan/inventory (chapter 03).</Empty>}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Hostname</Th><Th>Type</Th><Th>Vendor</Th><Th>Owner</Th><Th>Risk</Th><Th /></tr></thead>
          <tbody>
            {data.data.map((d) => (
              <tr key={d.id}>
                <Td>{d.hostname}{d.isGateway ? <span className="ml-2 text-xs text-primary">gateway</span> : null}</Td>
                <Td>{d.deviceType ?? "—"}</Td>
                <Td>{d.vendor ?? "—"}</Td>
                <Td>{d.owner ?? "—"}</Td>
                <Td><RiskBadge level={d.riskLevel} /></Td>
                <Td><Link className="text-primary underline" to={`/devices/${d.id}`}>open</Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
