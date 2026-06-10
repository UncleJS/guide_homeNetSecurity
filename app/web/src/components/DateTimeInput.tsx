import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Emits combined value as "yyyy-MM-dd HH:mm:ss" (local). Storage is UTC.
// Date field is type="text" (locale-proof); time uses matrix grids in a dropdown.
interface Props {
  value: string; // "yyyy-MM-dd HH:mm:ss" or ""
  onChange: (value: string) => void;
  id?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const FIVES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function sanitizeDate(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}
function sanitizeTime(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4)}`;
}

export function DateTimeInput({ value, onChange, id }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [datePart, timePart] = value ? value.split(" ") : ["", ""];
  const [date, setDate] = useState(datePart ?? "");
  const [time, setTime] = useState(timePart ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const [d, t] = value ? value.split(" ") : ["", ""];
    setDate(d ?? ""); setTime(t ?? "");
  }, [value]);

  // Combine and emit when both parts are valid.
  function emit(d: string, t: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const time = /^\d{2}:\d{2}:\d{2}$/.test(t) ? t : "00:00:00";
      onChange(`${d} ${time}`);
    } else if (!d && !t) {
      onChange("");
    }
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const [hh = "", mm = "", ss = ""] = time.split(":");
  function setSeg(idx: 0 | 1 | 2, v: string) {
    const segs = [hh || "00", mm || "00", ss || "00"];
    segs[idx] = v;
    const t = `${segs[0]}:${segs[1]}:${segs[2]}`;
    setTime(t); emit(date, t);
  }

  function openPicker() {
    const p = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!p) return;
    if (typeof p.showPicker === "function") p.showPicker(); else { p.focus(); p.click(); }
  }

  const cell = (active: boolean) =>
    cn("rounded px-0 py-1 text-xs font-mono text-foreground border border-border",
      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "bg-primary text-primary-foreground border-primary");

  return (
    <div ref={wrapRef} className="flex flex-wrap items-center gap-2">
      {/* Date (text, locale-proof) */}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="yyyy-MM-dd"
          pattern="\d{4}-\d{2}-\d{2}"
          maxLength={10}
          value={date}
          onChange={(e) => { const d = sanitizeDate(e.target.value); setDate(d); emit(d, time); }}
          className="h-9 w-40 rounded-md border border-border bg-input px-3 pr-9 font-mono text-sm text-foreground placeholder:text-foreground placeholder:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="button" onClick={openPicker} aria-label="Open date picker"
          className="absolute right-0 top-0 inline-flex h-9 w-9 items-center justify-center text-foreground">
          <CalendarDays className="h-4 w-4" />
        </button>
        <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true"
          value={/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""}
          onChange={(e) => { setDate(e.target.value); emit(e.target.value, time); }}
          className="absolute right-2 top-2 h-5 w-5 opacity-0" />
      </div>

      {/* Time (text + matrix dropdown) */}
      <div className="relative">
        <input
          type="text" inputMode="numeric" autoComplete="off" placeholder="HH:mm:ss"
          maxLength={8} value={time}
          onChange={(e) => { const t = sanitizeTime(e.target.value); setTime(t); emit(date, t); }}
          className="h-9 w-28 rounded-md border border-border bg-input px-3 pr-8 font-mono text-sm text-foreground placeholder:text-foreground placeholder:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Open time picker"
          className="absolute right-0 top-0 inline-flex h-9 w-8 items-center justify-center text-foreground">
          <ChevronDown className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-xl">
            <p className="mb-1 text-xs font-semibold text-foreground">Hour</p>
            <div className="mb-3 grid grid-cols-6 gap-1">
              {HOURS.map((h) => (
                <button type="button" key={h} className={cell(hh === h)} onClick={() => setSeg(0, h)}>{h}</button>
              ))}
            </div>
            <p className="mb-1 text-xs font-semibold text-foreground">Minute</p>
            <div className="mb-3 grid grid-cols-4 gap-1">
              {FIVES.map((m) => (
                <button type="button" key={m} className={cell(mm === m)} onClick={() => setSeg(1, m)}>{m}</button>
              ))}
            </div>
            <p className="mb-1 text-xs font-semibold text-foreground">Second</p>
            <div className="grid grid-cols-4 gap-1">
              {FIVES.map((s) => (
                <button type="button" key={s} className={cell(ss === s)} onClick={() => setSeg(2, s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
