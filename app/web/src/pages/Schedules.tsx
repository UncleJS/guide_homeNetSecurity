import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Checkbox, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { formatLocal } from "@/lib/format";
import { EMPTY, Fields, formReady, toPayload, type ScheduleForm } from "@/components/ScheduleForm";

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

  const [form, setForm] = useState<ScheduleForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => navigate(`/schedules/${s.id}`)}>Edit</Button>
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
    </div>
  );
}
