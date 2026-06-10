import { Badge } from "./ui";

const RISK_CLASS: Record<string, string> = {
  low: "border-success text-foreground",
  medium: "border-warning text-foreground",
  high: "border-danger text-foreground",
  critical: "bg-danger text-foreground border-danger",
};

const ZONE_CLASS: Record<string, string> = {
  mgmt: "border-primary",
  trusted: "border-success",
  work: "border-primary",
  iot: "border-warning",
  guest: "border-danger",
  unassigned: "border-border",
  wan: "border-border",
};

const PRIORITY_CLASS: Record<string, string> = {
  low: "border-success text-foreground",
  medium: "border-warning text-foreground",
  high: "border-danger text-foreground",
};

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-foreground opacity-60">—</span>;
  return <Badge className={PRIORITY_CLASS[priority] ?? "border-border"}>{priority}</Badge>;
}

export function RiskBadge({ level }: { level: string }) {
  return <Badge className={RISK_CLASS[level] ?? "border-border"}>{level}</Badge>;
}

export function ZoneBadge({ zone }: { zone: string }) {
  return <Badge className={ZONE_CLASS[zone] ?? "border-border"}>{zone}</Badge>;
}
