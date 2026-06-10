import { Link } from "react-router-dom";
import { useApi } from "@/api/client";
import { Card, CardTitle, Table, Th, Td } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { RiskBadge, ZoneBadge } from "@/components/badges";
import { formatLocal } from "@/lib/format";

interface Summary {
  totals: { devices: number; subnets: number; ipAddresses: number };
  zoneCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  highRiskCount: number;
  subnetUtilization: Array<{ subnetId: number; name: string; cidr: string; zone: string; used: number; capacity: number | null; percent: number | null }>;
  hardening: { total: number; done: number; na: number; applicable: number; percent: number };
  staleDevices: Array<{ id: number; hostname: string; lastSeenUTC: string | null; riskLevel: string }>;
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-foreground opacity-80">{label}</span>
      <span className={`text-3xl font-bold text-foreground ${accent ?? ""}`}>{value}</span>
    </Card>
  );
}

export function Dashboard() {
  const { data, loading, error, refetch } = useApi<Summary>("/dashboard/summary");
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Devices" value={data.totals.devices} />
        <Stat label="Subnets" value={data.totals.subnets} />
        <Stat label="IP Addresses" value={data.totals.ipAddresses} />
        <Stat label="High-risk" value={data.highRiskCount} accent={data.highRiskCount ? "text-danger" : ""} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Hardening completion</CardTitle>
          <div className="mb-2 h-4 w-full overflow-hidden rounded-full border border-border bg-input">
            <div className="h-full bg-success" style={{ width: `${data.hardening.percent}%` }} />
          </div>
          <p className="text-sm text-foreground">
            {data.hardening.percent}% — {data.hardening.done}/{data.hardening.applicable} applicable controls done
            {data.hardening.na ? ` (${data.hardening.na} n/a)` : ""}
          </p>
        </Card>

        <Card>
          <CardTitle className="mb-3">Devices by trust zone</CardTitle>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.zoneCounts).map(([zone, n]) => (
              <span key={zone} className="flex items-center gap-1">
                <ZoneBadge zone={zone} /> <span className="text-sm text-foreground">{n}</span>
              </span>
            ))}
          </div>
          <CardTitle className="mb-2 mt-4">By risk</CardTitle>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.riskCounts).map(([r, n]) => (
              <span key={r} className="flex items-center gap-1">
                <RiskBadge level={r} /> <span className="text-sm text-foreground">{n}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle className="mb-3">Subnet IP utilization</CardTitle>
        <div className="space-y-3">
          {data.subnetUtilization.map((s) => (
            <div key={s.subnetId}>
              <div className="mb-1 flex items-center justify-between text-sm text-foreground">
                <span className="flex items-center gap-2"><ZoneBadge zone={s.zone} /> {s.name} <span className="font-mono opacity-80">{s.cidr}</span></span>
                <span>{s.used}{s.capacity != null ? ` / ${s.capacity}` : ""}{s.percent != null ? ` (${s.percent}%)` : ""}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-input">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, s.percent ?? 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Stale devices (not seen in 30+ days)</CardTitle>
        {data.staleDevices.length === 0 ? (
          <p className="text-sm text-foreground opacity-80">None — every device has been seen recently.</p>
        ) : (
          <Table>
            <thead><tr><Th>Hostname</Th><Th>Risk</Th><Th>Last seen</Th></tr></thead>
            <tbody>
              {data.staleDevices.map((d) => (
                <tr key={d.id}>
                  <Td><Link className="text-primary underline" to={`/devices/${d.id}`}>{d.hostname}</Link></Td>
                  <Td><RiskBadge level={d.riskLevel} /></Td>
                  <Td>{formatLocal(d.lastSeenUTC)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
