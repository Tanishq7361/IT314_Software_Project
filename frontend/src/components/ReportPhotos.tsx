"use client";

import React, { useCallback, useEffect, useState } from "react";

import {
  ATTACHMENT_LIMITS,
  attachmentUrl,
  fetchAttachments,
  removeAttachment,
  uploadAttachment,
  type AttachmentData,
} from "@/services/citizenApi";

/** Photos on one of the signed-in citizen's own reports: view, add and remove (NU-FR-05). */
export function ReportPhotos({ incidentId, closed }: { incidentId: string; closed: boolean }) {
  const [items, setItems] = useState<AttachmentData[]>([]);
  const [max, setMax] = useState<number>(ATTACHMENT_LIMITS.maxFiles);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchAttachments(incidentId);
    if (res.data) {
      setItems(res.data.items);
      setMax(res.data.max_attachments);
    }
  }, [incidentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this report's photos once it is shown
    load();
  }, [load]);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ATTACHMENT_LIMITS.types.includes(file.type)) return setError("Choose a JPEG, PNG or WebP photo.");
    if (file.size > ATTACHMENT_LIMITS.maxBytes) return setError(`The photo is larger than ${ATTACHMENT_LIMITS.maxBytes / (1024 * 1024)} MB.`);
    setBusy(true);
    setError(null);
    const res = await uploadAttachment(incidentId, file);
    setBusy(false);
    if (res.error) setError(res.error);
    else load();
  }

  async function onRemove(evidenceId: string) {
    setBusy(true);
    setError(null);
    const res = await removeAttachment(incidentId, evidenceId);
    setBusy(false);
    if (res.error) setError(res.error);
    else load();
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-800 text-xs">
      <div className="font-semibold text-slate-200 mb-2">Photos ({items.length}/{max})</div>
      {items.length === 0 && <p className="text-slate-400">No photos attached.</p>}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => (
          <li key={item.evidence_id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachmentUrl(incidentId, item.evidence_id)}
              alt={item.file_name}
              className="h-24 w-full rounded object-cover bg-slate-900"
            />
            <div className="mt-1.5 truncate text-slate-200">{item.file_name}</div>
            <div className="flex items-center justify-between gap-2 text-slate-400">
              <span>{item.status}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(item.evidence_id)}
                className="text-red-300 hover:text-red-200 cursor-pointer disabled:opacity-50"
                aria-label={`Remove ${item.file_name}`}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!closed && items.length < max && (
        <label className="mt-3 inline-block">
          <span className="sr-only">Add a photo</span>
          <input
            type="file"
            accept={ATTACHMENT_LIMITS.types.join(",")}
            disabled={busy}
            onChange={onPick}
            className="block text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-700"
          />
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
    </div>
  );
}
