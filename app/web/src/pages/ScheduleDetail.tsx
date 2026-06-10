import { Link, useNavigate, useParams } from "react-router-dom";
import { apiPost, useApi, useMutation } from "@/api/client";
import { Badge, Button, Card, CardTitle, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { formatLocal } from "@/lib/format";
import { RUN_STATUS_CLASS, type Schedule } from "./Schedules.tsx";

interface Run {
  id: number; scheduledForUTC: string; startedAtUTC: string | null;
  finishedAtUTC: string | null; status: string; hostsScanned: number;
  openPorts: number; error: string | null;
}

type ScheduleFull = Omit<Schedule, "lastRunStatus" | "lastRunAtUTC"> & { runs: Run[] };

export function ScheduleDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi<ScheduleFull>(`/schedules/${id}`);
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

      <Card>
        <CardTitle className="mb-3">Schedule</CardTitle>
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <div><dt className="font-medium text-foreground opacity-80">Target</dt><dd className="text-foreground">{data.targetType} #{data.targetType === "subnet" ? data.subnetId : data.deviceId}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Ports</dt><dd className="font-mono text-foreground">{data.portSpec}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Recurrence</dt><dd className="text-foreground">{data.recurrence}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Next run</dt><dd className="text-foreground">{formatLocal(data.nextRunAtUTC)}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Reminder</dt><dd className="text-foreground">{data.reminderMinutesBefore != null && data.reminderEmail ? `${data.reminderMinutesBefore} min before → ${data.reminderEmail}` : "off"}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Enabled</dt><dd>{data.enabled === 1 ? <Badge className="border-success">on</Badge> : <Badge>off</Badge>}</dd></div>
        </dl>
        {data.description && <p className="mt-3 text-sm text-foreground">{data.description}</p>}
      </Card>

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
