import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiPatch, useApi, useMutation } from "@/api/client";
import { Badge, Button, Modal, Table, Th, Td, Textarea } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { formatLocal } from "@/lib/format";

export interface IpRow {
  id: number;
  subnetId: number;
  deviceId: number | null;
  address: string;
  assignmentType: string;
  macAddress: string | null;
  status: string;
  archivedAtUTC: string | null;
}

interface PortRow {
  id: number;
  port: number;
  protocol: string;
  service: string | null;
  notes: string | null;
  source: "manual" | "scan";
  lastSeenAtUTC: string | null;
  ipAddressId: number | null;
}

// Drilldown body: the IP's bound ports plus the owning device's device-wide
// ports (a host-level open port is reachable on every one of its addresses).
// This is the single place where a port's note is added, edited, and shown.
function PortsSubRow({ ip }: { ip: IpRow }) {
  const ports = useApi<{ data: PortRow[] }>(
    ip.deviceId != null
      ? `/device-ports?deviceId=${ip.deviceId}&ipAddressId=${ip.id}&includeDeviceWide=true&pageSize=200`
      : null,
  );
  const [editingNote, setEditingNote] = useState<PortRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const noteMut = useMutation();

  if (ip.deviceId == null) {
    return <p className="px-2 py-1 text-sm text-foreground opacity-80">No device assigned to this address — no ports.</p>;
  }
  if (ports.loading) return <Loading label="Loading ports…" />;
  if (ports.error) return <ErrorState message={ports.error} onRetry={ports.refetch} />;
  const rows = ports.data?.data ?? [];
  if (rows.length === 0) {
    return <p className="px-2 py-1 text-sm text-foreground opacity-80">No ports recorded for this address.</p>;
  }

  function openNote(p: PortRow) {
    setEditingNote(p);
    setNoteDraft(p.notes ?? "");
  }

  async function saveNote() {
    if (!editingNote) return;
    const ok = await noteMut.run(async () => {
      await apiPatch(`/device-ports/${editingNote.id}`, { notes: noteDraft || null });
      await ports.refetch();
    });
    if (ok) setEditingNote(null);
  }

  return (
    <>
      <Table>
        <thead><tr><Th>Port</Th><Th>Proto</Th><Th>Service</Th><Th>Notes</Th><Th>Scope</Th><Th>Source</Th><Th>Last seen</Th><Th className="text-right">Actions</Th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="font-mono">{p.port}</Td>
              <Td>{p.protocol}</Td>
              <Td>{p.service ?? "—"}</Td>
              <Td className="max-w-64">
                <span className="block truncate" title={p.notes ?? undefined}>{p.notes ?? "—"}</span>
              </Td>
              <Td>{p.ipAddressId === null ? <Badge>device-wide</Badge> : "—"}</Td>
              <Td><Badge className={p.source === "scan" ? "border-primary" : ""}>{p.source}</Badge></Td>
              <Td>{formatLocal(p.lastSeenAtUTC)}</Td>
              <Td className="text-right">
                <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openNote(p)}>
                  {p.notes ? "Edit note" : "Add note"}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={editingNote !== null}
        onClose={() => setEditingNote(null)}
        title={editingNote ? `Note for ${ip.address}:${editingNote.port}` : "Port note"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingNote(null)}>Cancel</Button>
            <Button onClick={saveNote} disabled={noteMut.pending}>{noteMut.pending ? "Saving…" : "Save note"}</Button>
          </>
        }
      >
        <Textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="What runs here? Action needed? e.g. “Grafana container — restrict to mgmt VLAN.”"
        />
        {noteMut.error && <p className="mt-2 text-sm text-danger">{noteMut.error}</p>}
      </Modal>
    </>
  );
}

export function IpPortsTable({
  ips, subnetName, deviceName, renderActions,
}: {
  ips: IpRow[];
  subnetName?: (id: number) => string;
  deviceName?: (id: number | null) => ReactNode;
  renderActions?: (ip: IpRow) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const colCount = 4 + (subnetName ? 1 : 0) + (deviceName ? 1 : 0) + (renderActions ? 1 : 0);

  return (
    <Table>
      <thead><tr>
        <Th className="w-8" />
        <Th>Address</Th>
        {subnetName && <Th>Subnet</Th>}
        <Th>Type</Th>
        {deviceName && <Th>Device</Th>}
        <Th>MAC</Th>
        {renderActions && <Th className="text-right">Actions</Th>}
      </tr></thead>
      <tbody>
        {ips.map((ip) => {
          const archived = ip.archivedAtUTC != null;
          const open = expanded.has(ip.id);
          return (
            <Fragment key={ip.id}>
              <tr className={archived ? "opacity-60" : undefined}>
                <Td className="w-8 px-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? `Collapse ports for ${ip.address}` : `Expand ports for ${ip.address}`}
                    onClick={() => toggle(ip.id)}
                    className="rounded-md p-1 text-foreground hover:bg-accent"
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </Td>
                <Td className="font-mono">
                  {ip.address}
                  {archived && <span className="ml-2 font-sans text-xs text-foreground opacity-70">(archived)</span>}
                </Td>
                {subnetName && <Td>{subnetName(ip.subnetId)}</Td>}
                <Td>{ip.assignmentType}</Td>
                {deviceName && <Td>{deviceName(ip.deviceId)}</Td>}
                <Td className="font-mono">{ip.macAddress ?? "—"}</Td>
                {renderActions && <Td className="text-right">{renderActions(ip)}</Td>}
              </tr>
              {open && (
                <tr>
                  <td colSpan={colCount} className="border-b border-border bg-accent/30 px-4 py-3">
                    <PortsSubRow ip={ip} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
