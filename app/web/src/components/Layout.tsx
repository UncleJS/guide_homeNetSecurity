import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Network, HardDrive, Globe, Share2, ShieldCheck, Radar, CalendarDays, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/subnets", label: "Subnets / VLANs", icon: Network },
  { to: "/devices", label: "Devices", icon: HardDrive },
  { to: "/ips", label: "IP Addresses", icon: Globe },
  { to: "/map", label: "Network Map", icon: Share2 },
  { to: "/schedules", label: "Scan Schedules", icon: Radar },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/notes", label: "Notes", icon: StickyNote },
];

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border bg-card p-4">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">NetInventory</span>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-6 text-xs text-foreground opacity-70">
          Local-only · pairs with the hardening guide
        </p>
      </aside>
      <main className="flex-1 overflow-x-hidden p-6">
        <Outlet />
      </main>
    </div>
  );
}
