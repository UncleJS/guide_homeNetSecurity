import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPatch, apiPost, useApi, useMutation } from "@/api/client";
import {
  Button, Card, CardTitle, Checkbox, Field, Input, Modal, Select, Table, Td, Textarea, Th,
} from "@/components/ui";
import { Loading, ErrorState, Empty } from "@/components/states";
import { PriorityBadge } from "@/components/badges";
import { DateTimeInput } from "@/components/DateTimeInput";
import { formatLocal, isPastUTC, isoToLocalInput, localToISO } from "@/lib/format";

const CATEGORIES = ["general", "history", "reference"];
const PRIORITIES = ["low", "medium", "high"];

interface Note {
  id: number; entityType: string | null; entityId: number | null;
  category: string; body: string; author: string | null;
  status: "open" | "done" | null; priority: string | null;
  dueAtUTC: string | null; doneAtUTC: string | null;
  createdAtUTC: string; archivedAtUTC: string | null;
}

type Form = {
  body: string; category: string; author: string;
  actionItem: boolean; status: "open" | "done"; priority: string; dueLocal: string;
};

const EMPTY: Form = { body: "", category: "general", author: "", actionItem: false, status: "open", priority: "medium", dueLocal: "" };

// Demoting to a plain note sends explicit nulls; the API also clears the rest.
const toPayload = (f: Form) => ({
  body: f.body,
  category: f.category,
  author: f.author || null,
  status: f.actionItem ? f.status : null,
  priority: f.actionItem ? f.priority : null,
  dueAtUTC: f.actionItem && f.dueLocal ? localToISO(f.dueLocal) : null,
});

const fromRow = (n: Note): Form => ({
  body: n.body,
  category: n.category,
  author: n.author ?? "",
  actionItem: n.status != null,
  status: n.status ?? "open",
  priority: n.priority ?? "medium",
  dueLocal: isoToLocalInput(n.dueAtUTC),
});

function Fields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <>
      <Field label="Note">
        <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Reminder, comment, or context…" />
      </Field>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Author (optional)">
          <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="you" />
        </Field>
      </div>
      <div className="mb-3">
        <Checkbox label="Action item (needs follow-up)" checked={form.actionItem} onChange={(v) => setForm({ ...form, actionItem: v })} />
      </div>
      {form.actionItem && (
        <div className="grid gap-x-4 md:grid-cols-3">
          <Field label="Due (optional)">
            <DateTimeInput value={form.dueLocal} onChange={(v) => setForm({ ...form, dueLocal: v })} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "open" | "done" })}>
              <option value="open">open</option>
              <option value="done">done</option>
            </Select>
          </Field>
        </div>
      )}
    </>
  );
}

function AttachedTo({ n }: { n: Note }) {
  if (!n.entityType) return <span className="opacity-80">general</span>;
  if (n.entityType === "device") return <Link className="text-primary underline" to={`/devices/${n.entityId}`}>device #{n.entityId}</Link>;
  if (n.entityType === "scan_run") return <Link className="text-primary underline" to={`/runs/${n.entityId}`}>scan run #{n.entityId}</Link>;
  return <span>{n.entityType === "ip_address" ? "ip" : n.entityType} #{n.entityId}</span>;
}

export function Notes() {
  const [show, setShow] = useState("all"); // all | general | entity | action
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const params = new URLSearchParams({ pageSize: "200" });
  if (show === "general" || show === "entity") params.set("scope", show);
  if (show === "action") params.set("actionItems", "true");
  if (statusFilter) params.set("status", statusFilter);
  if (priorityFilter) params.set("priority", priorityFilter);
  if (showArchived) params.set("includeArchived", "true");
  const { data, loading, error, refetch } = useApi<{ data: Note[] }>(`/notes?${params.toString()}`);

  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Note | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function create() {
    setSaving(true); setFormError(null);
    try {
      // This page creates general notes; entity notes are added on entity pages.
      await apiPost("/notes", toPayload(form));
      setForm(EMPTY);
      await refetch();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  function openEdit(n: Note) {
    setEditing(n); setEditForm(fromRow(n)); setEditError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditSaving(true); setEditError(null);
    try {
      await apiPatch(`/notes/${editing.id}`, toPayload(editForm));
      setEditing(null);
      await refetch();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save");
    } finally { setEditSaving(false); }
  }

  const rowMut = useMutation();
  const toggleStatus = (n: Note) => rowMut.run(async () => {
    await apiPatch(`/notes/${n.id}`, { status: n.status === "open" ? "done" : "open" });
    await refetch();
  });
  const archive = (id: number) => rowMut.run(async () => {
    await apiPost(`/notes/${id}/archive`, {});
    await refetch();
  });
  const restore = (id: number) => rowMut.run(async () => {
    await apiPost(`/notes/${id}/restore`, {});
    await refetch();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Notes</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Show:</span>
            <Select value={show} onChange={(e) => setShow(e.target.value)} className="w-36">
              <option value="all">all</option>
              <option value="general">general only</option>
              <option value="entity">entity-bound</option>
              <option value="action">action items</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Status:</span>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-28">
              <option value="">any</option>
              <option value="open">open</option>
              <option value="done">done</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">Priority:</span>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-28">
              <option value="">any</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardTitle className="mb-3">Add a note</CardTitle>
        <Fields form={form} setForm={setForm} />
        {formError && <p className="mb-2 text-sm text-danger">{formError}</p>}
        <Button onClick={create} disabled={saving || !form.body.trim()}>{saving ? "Saving…" : "Add note"}</Button>
      </Card>

      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {rowMut.error && <p className="text-sm text-danger">{rowMut.error}</p>}
      {data && data.data.length === 0 && <Empty title="No notes yet">Add reminders and comments above, or attach notes from a device / scan run page.</Empty>}
      {data && data.data.length > 0 && (
        <Table>
          <thead><tr><Th>Status</Th><Th>Note</Th><Th>Category</Th><Th>Priority</Th><Th>Due</Th><Th>Attached to</Th><Th>Created</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.data.map((n) => {
              const archived = n.archivedAtUTC != null;
              const overdue = n.status === "open" && isPastUTC(n.dueAtUTC);
              return (
                <tr key={n.id} className={archived ? "opacity-60" : undefined}>
                  <Td>
                    {n.status == null ? (
                      <span className="opacity-60">—</span>
                    ) : (
                      <Button
                        variant="outline"
                        className={`h-7 px-2 text-xs ${n.status === "done" ? "border-success" : ""}`}
                        onClick={() => toggleStatus(n)}
                        disabled={archived}
                        title={n.status === "open" ? "Mark done" : "Reopen"}
                      >
                        {n.status === "open" ? "open" : "done ✓"}
                      </Button>
                    )}
                  </Td>
                  <Td className="max-w-md">
                    <span className="whitespace-pre-wrap">{n.body}</span>
                    {n.author && <span className="ml-2 text-xs opacity-70">— {n.author}</span>}
                    {archived && <span className="ml-2 text-xs text-foreground opacity-70">(archived)</span>}
                  </Td>
                  <Td>{n.category}</Td>
                  <Td><PriorityBadge priority={n.priority} /></Td>
                  <Td className={overdue ? "text-danger font-medium" : undefined}>
                    {formatLocal(n.dueAtUTC)}
                    {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                  </Td>
                  <Td><AttachedTo n={n} /></Td>
                  <Td>{formatLocal(n.createdAtUTC)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {archived ? (
                        <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => restore(n.id)}>Unarchive</Button>
                      ) : (
                        <>
                          <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(n)}>Edit</Button>
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => archive(n.id)}>Archive</Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit note"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editForm.body.trim()}>{editSaving ? "Saving…" : "Save changes"}</Button>
          </>
        }
      >
        <Fields form={editForm} setForm={setEditForm} />
        {editError && <p className="text-sm text-danger">{editError}</p>}
      </Modal>
    </div>
  );
}
