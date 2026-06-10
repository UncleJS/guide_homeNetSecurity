import { useState } from "react";
import { apiPost, useApi, useMutation } from "@/api/client";
import { formatLocal } from "@/lib/format";
import { Button, Card, CardTitle, Textarea, Select, Badge } from "./ui";
import { Loading, ErrorState, Empty } from "./states";

interface Note {
  id: number;
  category: "history" | "reference" | "general";
  body: string;
  author: string | null;
  createdAtUTC: string;
}

const CAT_CLASS: Record<string, string> = {
  history: "border-primary",
  reference: "border-warning",
  general: "border-border",
};

// Reusable history/reference trail for any entity (subnet | device | ip_address | scan_run).
export function NotesPanel({
  entityType, entityId,
}: { entityType: "subnet" | "device" | "ip_address" | "scan_run"; entityId: number }) {
  const path = `/notes?entityType=${entityType}&entityId=${entityId}&pageSize=200`;
  const { data, loading, error, refetch } = useApi<{ data: Note[] }>(path);
  const notes = data?.data ?? null;
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"history" | "reference" | "general">("general");
  const saveMut = useMutation();

  async function add() {
    if (!body.trim()) return;
    const ok = await saveMut.run(async () => {
      await apiPost("/notes", { entityType, entityId, category, body });
      await refetch();
    });
    if (ok) setBody("");
  }

  return (
    <Card>
      <CardTitle className="mb-3">Notes &amp; History</CardTitle>

      <div className="mb-4 space-y-2">
        <Textarea
          placeholder="Add a note — firmware change, finding, reference link…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="w-40">
            <option value="general">general</option>
            <option value="history">history</option>
            <option value="reference">reference</option>
          </Select>
          <Button onClick={add} disabled={saveMut.pending || !body.trim()}>{saveMut.pending ? "Saving…" : "Add note"}</Button>
        </div>
        {saveMut.error && <p className="text-sm text-danger">{saveMut.error}</p>}
      </div>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {notes && notes.length === 0 && <Empty title="No notes yet">Add the first history or reference entry above.</Empty>}
      {notes && notes.length > 0 && (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <Badge className={CAT_CLASS[n.category]}>{n.category}</Badge>
                <span className="text-xs text-foreground opacity-80">{formatLocal(n.createdAtUTC)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
              {n.author && <p className="mt-1 text-xs text-foreground opacity-80">— {n.author}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
