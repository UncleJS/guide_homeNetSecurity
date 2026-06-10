import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Inbox } from "lucide-react";
import { Button } from "./ui";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-danger p-6 text-foreground">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-danger" />
        <span className="font-medium">Something went wrong</span>
      </div>
      <p className="text-foreground opacity-90">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center text-foreground">
      <Inbox className="h-6 w-6 opacity-80" />
      <p className="font-medium">{title}</p>
      {children && <div className="text-foreground opacity-90">{children}</div>}
    </div>
  );
}
