import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, useApi, useMutation } from "@/api/client";
import { Button, Card, CardTitle, Checkbox, Select, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { RiskBadge } from "@/components/badges";
import { EMPTY, Fields, RISKS, toPayload, type DeviceForm } from "@/components/DeviceForm";

interface Device {
  id: number; hostname: string; deviceType: string | null; vendor: string | null;
  owner: string | null; location: string | null; firmwareVersion: string | null;
  riskLevel: string; isGateway: number; archivedAtUTC: string | null;
}

export function Devices() {
  const navigate = useNavigate();
  const [riskFilter, setRiskFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const params = new URLSearchParams({ pageSize: "200" });
  if (riskFilter) params.set("riskLevel", riskFilter);
  if (showArchived) params.set("includeArchived", "true");
  const { data, loading, error, refetch } = useApi<{ data: Device[] }>(`/devices?${params.toString()}`);

  const [form, setForm] = useState<DeviceForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => navigate(`/devices/${d.id}`)}>Edit</Button>
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
    </div>
  );
}
