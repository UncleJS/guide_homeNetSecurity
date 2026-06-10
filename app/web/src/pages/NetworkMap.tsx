import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
  Handle, Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiPost, useApi } from "@/api/client";
import { Card } from "@/components/ui";
import { Loading, ErrorState } from "@/components/states";
import { Globe } from "lucide-react";

interface GraphNode {
  id: string; type: string; label: string; deviceId?: number;
  zone: string; ip: string | null; risk: string | null;
  isGateway?: boolean; posX: number | null; posY: number | null;
}
interface GraphEdge { id: string; source: string; target: string; type: string; label: string | null; explicit: boolean }

const ZONE_COLOR: Record<string, string> = {
  mgmt: "#38bdf8", trusted: "#22c55e", work: "#38bdf8",
  iot: "#f59e0b", guest: "#ef4444", unassigned: "#64748b", wan: "#94a3b8",
};
const RISK_COLOR: Record<string, string> = {
  low: "#22c55e", medium: "#f59e0b", high: "#ef4444", critical: "#ef4444",
};

// Custom device node — card with zone-colored body + risk-colored border.
function DeviceNode({ data }: { data: GraphNode }) {
  return (
    <div
      style={{ borderColor: RISK_COLOR[data.risk ?? "low"] ?? "#334155" }}
      className="min-w-[140px] rounded-md border-2 bg-card px-3 py-2 text-foreground shadow"
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ZONE_COLOR[data.zone] ?? "#64748b" }} />
        <span className="text-sm font-semibold text-foreground">{data.label}</span>
        {data.isGateway && <span className="text-[10px] text-foreground opacity-80">GW</span>}
      </div>
      {data.ip && <div className="font-mono text-xs text-foreground opacity-90">{data.ip}</div>}
      <div className="text-[10px] uppercase text-foreground opacity-80">{data.zone}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function InternetNode({ data }: { data: GraphNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border-2 border-border bg-accent px-3 py-2 text-foreground shadow">
      <Globe className="h-4 w-4" /> <span className="font-semibold">{data.label}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { device: DeviceNode, internet: InternetNode };

// Deterministic layout when nodes have no saved position: internet on top,
// then devices laid out in columns grouped by trust zone.
function layout(nodes: GraphNode[]): Node[] {
  const zoneOrder = ["wan", "mgmt", "trusted", "work", "iot", "guest", "unassigned"];
  const perZoneCount: Record<string, number> = {};
  return nodes.map((n) => {
    if (n.posX != null && n.posY != null) {
      return { id: n.id, type: n.type, position: { x: n.posX, y: n.posY }, data: n };
    }
    if (n.type === "internet") return { id: n.id, type: "internet", position: { x: 420, y: 0 }, data: n };
    const col = Math.max(0, zoneOrder.indexOf(n.zone));
    const row = perZoneCount[n.zone] = (perZoneCount[n.zone] ?? 0) + 1;
    return { id: n.id, type: "device", position: { x: col * 200, y: 140 + row * 110 }, data: n };
  });
}

export function NetworkMap() {
  const { data, loading, error, refetch } = useApi<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/map/graph");
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const flowEdges = useMemo<Edge[]>(() => (data?.edges ?? []).map((e) => ({
    id: e.id, source: e.source, target: e.target,
    label: e.label ?? undefined,
    animated: !e.explicit,
    style: { stroke: e.explicit ? "#38bdf8" : "#475569", strokeWidth: e.explicit ? 2 : 1 },
  })), [data]);

  useEffect(() => {
    if (data) { setNodes(layout(data.nodes)); setEdges(flowEdges); }
  }, [data, flowEdges, setNodes, setEdges]);

  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target || !c.source.startsWith("d") || !c.target.startsWith("d")) return;
    const sourceDeviceId = Number(c.source.slice(1));
    const targetDeviceId = Number(c.target.slice(1));
    if (sourceDeviceId === targetDeviceId) return;
    await apiPost("/links", { sourceDeviceId, targetDeviceId, linkType: "uplink" });
    await refetch();
  }, [refetch]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const d = node.data as GraphNode;
    if (d.deviceId) navigate(`/devices/${d.deviceId}`);
  }, [navigate]);

  if (loading) return <Loading label="Building network map…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Network Map</h1>
        <p className="text-sm text-foreground opacity-80">
          Drag between two devices to record an uplink · click a node to open it · solid blue = explicit link
        </p>
      </div>
      <Card className="h-[70vh] p-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </Card>
    </div>
  );
}
