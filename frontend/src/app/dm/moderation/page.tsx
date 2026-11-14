"use client";

import Link from "next/link";
import { useState } from "react";

import { useAction } from "@/components/use-action";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, LoadingRows, Notice, PageHeader, Textarea } from "@/components/ui";
import { api, useQuery } from "@/lib/api";
import { formatDuration, label, scenarioLabel } from "@/lib/format";

import { useStaff } from "../shell";

type Item = {
  evidence_id: string;
  incident_id: string;
  incident_ref: string;
  scenario: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  moderation_state: "PENDING" | "QUARANTINED";
  uploaded_at: string;
  age_seconds: number;
  uploaded_by_name: string;
  has_preview: boolean;
  last_reason: string | null;
};

type Decision = "APPROVE" | "QUARANTINE" | "REMOVE";

const DONE: Record<Decision, string> = { APPROVE: "approved", QUARANTINE: "quarantined", REMOVE: "removed" };

export default function ModerationPage() {
  const { can } = useStaff();
  const { data, error, loading, reload } = useQuery<{ items: Item[]; backlog: { count: number; oldest_age_seconds: number }; notes: string[] }>(
    can("MODERATOR") ? "moderation/queue" : null,
  );
  const { run, busy } = useAction();
  const [pending, setPending] = useState<{ item: Item; decision: Decision } | null>(null);
  const [reason, setReason] = useState("");

  if (!can("MODERATOR")) {
    return (
      <>
        <PageHeader title="Moderation" />
        <Notice tone="medium">The moderation queue requires the moderator permission.</Notice>
      </>
    );
  }

  async function decide() {
    if (!pending) return;
    const ok = await run(
      "mod",
      () => api(`moderation/${pending.item.evidence_id}/decision`, { method: "POST", body: { decision: pending.decision, reason } }),
      `${pending.item.file_name}: ${DONE[pending.decision]}`,
    );
    if (ok !== undefined) {
      setPending(null);
      setReason("");
      reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Moderation queue"
        description={data ? `${data.backlog.count} item(s) waiting · oldest ${formatDuration(data.backlog.oldest_age_seconds)}` : "Evidence awaiting a human decision"}
        actions={<Button onClick={reload} busy={loading && !!data}>Refresh</Button>}
      />
      {data?.notes.map((n) => <div key={n} className="mb-2"><Notice tone="info">{n}</Notice></div>)}
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && (
        <Card bodyClassName="p-0" className="mt-4">
          {data.items.length === 0 ? (
            <div className="p-5"><EmptyState title="The moderation queue is empty." /></div>
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((item) => (
                <li key={item.evidence_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  {item.has_preview ? (
                    // Opened on request only, never loaded automatically: each view is audited.
                    <a
                      href={`/api/dm/moderation/${item.evidence_id}/content`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-14 shrink-0 place-items-center rounded-lg border border-border text-center text-[11px] font-medium text-info hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                      aria-label={`View photo ${item.file_name} in a new tab`}
                    >
                      View photo
                    </a>
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted" aria-hidden>
                      No preview
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{item.file_name}</span>
                      <Badge tone={item.moderation_state === "QUARANTINED" ? "critical" : "medium"}>{label(item.moderation_state)}</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      <Link href={`/dm/incidents/${item.incident_id}`} className="font-mono text-info hover:underline">{item.incident_ref}</Link> ·{" "}
                      {scenarioLabel[item.scenario]} · {item.mime_type} · {Math.ceil(item.size_bytes / 1024)} KB · uploaded by {item.uploaded_by_name},{" "}
                      {formatDuration(item.age_seconds)} ago
                    </p>
                    {item.last_reason && <p className="mt-1 text-xs">Last reason: {item.last_reason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setPending({ item, decision: "APPROVE" })}>Approve</Button>
                    {item.moderation_state !== "QUARANTINED" && <Button size="sm" onClick={() => setPending({ item, decision: "QUARANTINE" })}>Quarantine</Button>}
                    <Button size="sm" variant="danger" onClick={() => setPending({ item, decision: "REMOVE" })}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `${label(pending.decision)} ${pending.item.file_name}` : ""}
        footer={<><Button onClick={() => setPending(null)}>Cancel</Button><Button variant={pending?.decision === "REMOVE" ? "danger" : "primary"} disabled={reason.trim().length < 3} busy={busy === "mod"} onClick={decide}>Confirm</Button></>}
      >
        {pending?.decision === "REMOVE" && <div className="mb-3"><Notice tone="critical">Removal is permanent; the file can no longer be approved.</Notice></div>}
        <Field label="Reason" hint="Recorded with your name and the time.">
          {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />}
        </Field>
      </Dialog>
    </>
  );
}
