import { useEffect } from "react";
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes,
  TextareaHTMLAttributes, ReactNode, HTMLAttributes,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Button --------------------------------------------------------------------
type Variant = "primary" | "outline" | "ghost" | "danger";
export function Button({
  variant = "primary", className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border border-border bg-transparent text-foreground hover:bg-accent",
    ghost: "bg-transparent text-foreground hover:bg-accent",
    danger: "bg-danger text-foreground hover:opacity-90",
  };
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant], className,
      )}
      {...props}
    />
  );
}

// Card ----------------------------------------------------------------------
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card p-4 text-foreground shadow", className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold uppercase tracking-wide text-foreground", className)} {...props} />;
}

// Input / Textarea / Select -------------------------------------------------
const fieldBase =
  "flex h-9 w-full rounded-md border border-border bg-input px-3 py-1 text-sm text-foreground " +
  "placeholder:text-foreground placeholder:opacity-60 shadow-sm transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "h-auto min-h-[72px] py-2", className)} {...props} />;
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}
export function Label({ className, children }: { className?: string; children: ReactNode }) {
  return <label className={cn("mb-1 block text-xs font-medium text-foreground", className)}>{children}</label>;
}

// Field wrapper -------------------------------------------------------------
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Badge ---------------------------------------------------------------------
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground", className)}>
      {children}
    </span>
  );
}

// Modal ---------------------------------------------------------------------
export function Modal({
  open, onClose, title, children, footer,
}: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode;
}) {
  // Close on Escape (backdrop click is handled below).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 text-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-foreground opacity-70 hover:bg-accent hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Toggle (archived view) ----------------------------------------------------
export function Checkbox({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// Table ---------------------------------------------------------------------
export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm text-foreground">{children}</table></div>;
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-border bg-accent px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-2 text-foreground", className)}>{children}</td>;
}
