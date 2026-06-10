import { useState } from "react";
import { apiPost, useApi } from "@/api/client";
import { Button, Card, CardTitle, Field, Input, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { ZoneBadge } from "@/components/badges";

const ZONES = ["mgmt", "trusted", "work", "iot", "guest"];

interface Subnet {
  id: number; name: string; cidr: string; vlanId: number | null;
  trustZone: string; gateway: string | null; dnsServers: string | null;
}

export function Subnets() {
  const { data, loading, error, refetch } = useApi<{ data: Subnet[] }>("/subnets");
  const [form, setForm] = useState({ name: "", cidr: "", vlanId: "", trustZone: "trusted", gateway: "", dnsServers: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    setSaving(true); setFormError(null);
    try {
      await apiPost("/subnets", {
        name: form.name, cidr: form.cidr,
        vlanId: form.vlanId ? Number(form.vlanId) : null,
        trustZone: form.trustZone,
        gateway: form.gateway || null, dnsServers: form.dnsServers || null,
      });
      setForm({ name: "", cidr: "", vlanId: "", trustZone: "trusted", gateway: "", dnsServers: "" });
      await refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Subnets / VLANs</h1>

      <Card>
        <CardTitle className="mb-3">Add a subnet</CardTitle>
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
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.name || !form.cidr}>{saving ? "Saving…" : "Add subnet"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <Empty title="No subnets yet">Add your first network above (start with your trusted LAN).</Empty>}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Name</Th><Th>CIDR</Th><Th>VLAN</Th><Th>Zone</Th><Th>Gateway</Th><Th>DNS</Th></tr></thead>
          <tbody>
            {data.data.map((s) => (
              <tr key={s.id}>
                <Td>{s.name}</Td>
                <Td className="font-mono">{s.cidr}</Td>
                <Td>{s.vlanId ?? "—"}</Td>
                <Td><ZoneBadge zone={s.trustZone} /></Td>
                <Td className="font-mono">{s.gateway ?? "—"}</Td>
                <Td className="font-mono">{s.dnsServers ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
