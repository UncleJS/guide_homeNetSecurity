import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "@/api/client";
import { MonthCalendar, type CalEvent } from "@/components/MonthCalendar";
import { Loading, ErrorState } from "@/components/states";
import { localDateKey } from "@/lib/format";

interface CalendarFeed {
  runs: {
    id: number;
    scheduleId: number;
    scheduleName: string;
    scheduledForUTC: string;
    status: "running" | "completed" | "failed";
  }[];
  occurrences: {
    scheduleId: number;
    scheduleName: string;
    atUTC: string;
  }[];
}

// The visible grid spans the Monday on/before the 1st to the Sunday after the
// month's end (local time) — query the feed for exactly that range in UTC.
function gridRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  end.setHours(23, 59, 59);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function Calendar() {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const navigate = useNavigate();

  const { from, to } = gridRange(view.year, view.month);
  const { data, loading, error, refetch } = useApi<CalendarFeed>(
    `/schedules/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

  const events: CalEvent[] = data
    ? [
        ...data.runs.map((r) => ({
          id: `run-${r.id}`,
          dateKey: localDateKey(r.scheduledForUTC),
          label: r.scheduleName,
          kind: r.status as CalEvent["kind"],
        })),
        ...data.occurrences.map((o, i) => ({
          id: `occ-${o.scheduleId}-${i}`,
          dateKey: localDateKey(o.atUTC),
          label: o.scheduleName,
          kind: "scheduled" as const,
        })),
      ]
    : [];

  function onEventClick(e: CalEvent) {
    if (e.id.startsWith("run-")) navigate(`/runs/${e.id.slice(4)}`);
    else navigate(`/schedules/${e.id.split("-")[1]}`);
  }

  function shift(delta: number) {
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Scan Calendar</h1>
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && (
        <MonthCalendar
          year={view.year}
          month={view.month}
          events={events}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={() => setView({ year: today.getFullYear(), month: today.getMonth() })}
          onEventClick={onEventClick}
        />
      )}
    </div>
  );
}
