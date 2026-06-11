import { Link, useParams } from "react-router-dom";
import { useApi } from "@/api/client";
import { Card, CardTitle } from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { ZoneBadge } from "@/components/badges";
import { IpPortsTable, type IpRow } from "@/components/IpPortsTable";

interface Subnet {
  id: number; name: string; cidr: string; vlanId: number | null;
  trustZone: string; gateway: string | null; dnsServers: string | null;
  description: string | null;
}

interface Device { id: number; hostname: string }

export function SubnetDetail() {
  const { id } = useParams();
  const subnet = useApi<Subnet>(`/subnets/${id}`);
  const ips = useApi<{ data: IpRow[] }>(`/ip-addresses?subnetId=${id}&pageSize=200`);
  const devices = useApi<{ data: Device[] }>("/devices?pageSize=200");

  if (subnet.loading) return <Loading />;
  if (subnet.error) return <ErrorState message={subnet.error} onRetry={subnet.refetch} />;
  if (!subnet.data) return null;
  const s = subnet.data;

  const deviceName = (deviceId: number | null) => {
    if (deviceId == null) return "—";
    const hostname = devices.data?.data.find((d) => d.id === deviceId)?.hostname ?? `#${deviceId}`;
    return (
      <Link to={`/devices/${deviceId}`} className="text-foreground underline-offset-2 hover:underline">
        {hostname}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/subnets" className="text-sm text-primary underline">← Subnets</Link>
        <h1 className="text-2xl font-bold text-foreground">{s.name}</h1>
        <ZoneBadge zone={s.trustZone} />
      </div>

      <Card>
        <CardTitle className="mb-3">Network</CardTitle>
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          <div><dt className="font-medium text-foreground opacity-80">CIDR</dt><dd className="font-mono text-foreground">{s.cidr}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">VLAN</dt><dd className="text-foreground">{s.vlanId ?? "—"}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Zone</dt><dd className="text-foreground">{s.trustZone}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">Gateway</dt><dd className="font-mono text-foreground">{s.gateway ?? "—"}</dd></div>
          <div><dt className="font-medium text-foreground opacity-80">DNS</dt><dd className="font-mono text-foreground">{s.dnsServers ?? "—"}</dd></div>
        </dl>
        {s.description && <p className="mt-3 text-sm text-foreground opacity-90">{s.description}</p>}
      </Card>

      <Card>
        <CardTitle className="mb-3">IP allocations</CardTitle>
        {ips.loading && <Loading />}
        {ips.error && <ErrorState message={ips.error} onRetry={ips.refetch} />}
        {ips.data && ips.data.data.length === 0 && (
          <Empty title="No IP allocations in this subnet">Allocate addresses on the <Link to="/ips" className="underline underline-offset-2">IP Addresses</Link> page.</Empty>
        )}
        {ips.data && ips.data.data.length > 0 && (
          <IpPortsTable ips={ips.data.data} deviceName={deviceName} />
        )}
      </Card>
    </div>
  );
}
