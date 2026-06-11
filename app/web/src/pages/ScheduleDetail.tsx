import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { formatLocal } from "@/lib/format";
import { Fields, formReady, fromRow, toPayload, type ScheduleForm } from "@/components/ScheduleForm";
import { RUN_STATUS_CLASS, type Schedule } from "./Schedules.tsx";

interface Run {
  id: number; scheduledForUTC: string; startedAtUTC: string | null;
  finishedAtUTC: string | null; status: string; hostsScanned: number;
  openPorts: number; error: string | null;
}

type ScheduleFull = Omit<Schedule, "lastRunStatus" | "lastRunAtUTC"> & { runs: Run[] };

function ScheduleCard({
  schedule, subnets, devices, onSaved,
}: {
  schedule: ScheduleFull;
  subnets: { id: number; name: string; cidr: string }[];
  devices: { id: number; hostname: string }[];
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<ScheduleForm>(fromRow(schedule));
  const saveMut = useMutation();

  const save = () => saveMut.run(async () => {
    await apiPatch(`/schedules/${schedule.id}`, toPayload(form));
    await onSaved();
  });

  return (
    <Card>
      <CardTitle className="mb-3">Schedule</CardTitle>
      <Fields form={form} setForm={setForm} subnets={subnets} devices={devices} />
      {saveMut.error && <p className="mb-2 text-sm text-danger">{saveMut.error}</p>}
      <Button onClick={save} disabled={saveMut.pending || !formReady(form)}>{saveMut.pending ? "Saving…" : "Save changes"}</Button>
    </Card>
  );
}

export function ScheduleDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi<ScheduleFull>(`/schedules/${id}`);
  const { data: subnetData } = useApi<{ data: { id: number; name: string; cidr: string }[] }>("/subnets?pageSize=200");
  const { data: deviceData } = useApi<{ data: { id: number; hostname: string }[] }>("/devices?pageSize=200");
  const navigate = useNavigate();
  const runMut = useMutation();

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const runNow = () => runMut.run(async () => {
    const run = await apiPost<{ id: number }>(`/schedules/${data.id}/run-now`, {});
    navigate(`/runs/${run.id}`);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/schedules" className="text-sm text-foreground underline-offset-2 hover:underline">← Scan Schedules</Link>
          <h1 className="text-2xl font-bold text-foreground">{data.name}</h1>
        </div>
        <Button onClick={runNow} disabled={runMut.pending}>{runMut.pending ? "Starting…" : "Run now"}</Button>
      </div>
      {runMut.error && <p className="text-sm text-danger">{runMut.error}</p>}

      <ScheduleCard
        key={data.id}
        schedule={data}
        subnets={subnetData?.data ?? []}
        devices={deviceData?.data ?? []}
        onSaved={refetch}
      />

      <Card>
        <CardTitle className="mb-3">Recent runs</CardTitle>
        {data.runs.length === 0 && <Empty title="No runs yet">Use “Run now” or wait for the next scheduled occurrence.</Empty>}
        {data.runs.length > 0 && (
          <Table>
            <thead><tr>
              <Th>Scheduled for</Th><Th>Started</Th><Th>Finished</Th><Th>Status</Th>
              <Th>Hosts</Th><Th>Open ports</Th><Th>Error</Th>
            </tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <Td><Link to={`/runs/${r.id}`} className="text-foreground underline-offset-2 hover:underline">{formatLocal(r.scheduledForUTC)}</Link></Td>
                  <Td>{formatLocal(r.startedAtUTC)}</Td>
                  <Td>{formatLocal(r.finishedAtUTC)}</Td>
                  <Td><Badge className={RUN_STATUS_CLASS[r.status]}>{r.status}</Badge></Td>
                  <Td>{r.hostsScanned}</Td>
                  <Td>{r.openPorts}</Td>
                  <Td className="max-w-64 truncate" >{r.error ? <span className="text-danger" title={r.error}>{r.error}</span> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
