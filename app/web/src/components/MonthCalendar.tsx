import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export type CalEventKind = "scheduled" | "running" | "completed" | "failed";

export interface CalEvent {
  id: string;
  dateKey: string; // "yyyy-MM-dd" in the viewer's LOCAL time
  label: string;
  kind: CalEventKind;
}

const KIND_CLASS: Record<CalEventKind, string> = {
  scheduled: "border-primary",
  running: "border-warning",
  completed: "border-success",
  failed: "border-danger",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday-first month grid: every day from the Monday on/before the 1st to the
// Sunday on/after the month's last day.
function gridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

export function MonthCalendar({
  year, month, events, onPrev, onNext, onToday, onEventClick,
}: {
  year: number;
  month: number; // 0-based
  events: CalEvent[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventClick: (event: CalEvent) => void;
}) {
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.dateKey) ?? [];
    list.push(e);
    byDay.set(e.dateKey, list);
  }
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{MONTHS[month]} {year}</h2>
        <div className="flex gap-2">
          <Button variant="outline" className="h-8 px-2" onClick={onPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-8 px-3 text-xs" onClick={onToday}>Today</Button>
          <Button variant="outline" className="h-8 px-2" onClick={onNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-accent px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
            {w}
          </div>
        ))}
        {gridDays(year, month).map((day) => {
          const key = dayKey(day);
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = day.getMonth() === month;
          return (
            <div
              key={key}
              className={cn(
                "min-h-24 bg-card p-1",
                !inMonth && "opacity-50",
                key === todayKey && "ring-2 ring-inset ring-primary",
              )}
            >
              <div className="px-1 text-xs font-medium text-foreground">{day.getDate()}</div>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEventClick(e)}
                    title={e.label}
                    className={cn(
                      "block w-full truncate rounded border bg-background px-1 py-0.5 text-left text-xs text-foreground hover:bg-accent",
                      KIND_CLASS[e.kind],
                    )}
                  >
                    {e.label}
                  </button>
                ))}
                {dayEvents.length > MAX_CHIPS && (
                  <p className="px-1 text-xs text-foreground opacity-80">+{dayEvents.length - MAX_CHIPS} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-primary bg-background" /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-warning bg-background" /> Running</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-success bg-background" /> Completed</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-danger bg-background" /> Failed</span>
      </div>
    </div>
  );
}
