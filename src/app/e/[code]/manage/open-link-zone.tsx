"use client";

import { useState } from "react";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { Copy } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";

const ROW =
  "press flex w-full items-baseline gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function OpenLinkZone({
  lookup,
  open,
  capacity,
  joined,
  shareUrl,
  onNotice,
}: {
  lookup: string;
  open: boolean;
  capacity: number | null;
  /** Every registration, as Sold out counts it. */
  joined: number;
  shareUrl: string;
  onNotice: (text: string) => void;
}) {
  const [on, setOn] = useState(open);
  const [limit, setLimit] = useState(capacity);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(capacity ? String(capacity) : "");
  const { busy: running, run } = useBusyAction<"save">();
  const busy = running !== null;
  const [error, setError] = useState<string | null>(null);

  const save = (body: { on?: boolean; capacity?: number | null }): Promise<boolean> =>
    run("save", async () => {
      setError(null);
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/open-link`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Could not save.");
          return false;
        }
        return true;
      } catch {
        setError("Could not save.");
        return false;
      }
    }).then((done) => done === true);

  const toggle = async (next: boolean) => {
    setOn(next);
    if (!(await save({ on: next }))) setOn(!next);
  };

  const saveCapacity = async () => {
    setEditing(false);
    const text = draft.trim();
    const next = text ? Number(text) : null;
    if (next === limit) return;
    if (next !== null && (!Number.isInteger(next) || next < 1)) {
      setDraft(limit ? String(limit) : "");
      return;
    }
    const previous = limit;
    setLimit(next);
    if (!(await save({ capacity: next }))) {
      setLimit(previous);
      setDraft(previous ? String(previous) : "");
    }
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(shareUrl);
      onNotice("Link copied");
    } catch {
      onNotice("Could not copy");
    }
  };

  const shown = shareUrl.replace(/^https?:\/\//, "");
  const left = limit ? Math.max(0, limit - joined) : null;

  return (
    <Zone label="Open link" align="start">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Switch checked={on} disabled={busy} onCheckedChange={(checked) => void toggle(checked === true)} aria-label="Open link" />
          <span className="t-body text-[var(--ink)]">{on ? "On" : "Off"}</span>
        </div>
        {on ? (
          <>
            <button type="button" onClick={() => void copy()} className={`${ROW} justify-between`}>
              <span className="min-w-0 break-all">{shown}</span>
              <Copy aria-label="Copy" className="shrink-0 self-center text-[var(--ink)]" size={16} strokeWidth={1.25} />
            </button>
            {editing ? (
              <span className="flex items-baseline gap-2 t-body text-[var(--ink)]">
                Capacity
                <input
                  autoFocus
                  aria-label="Capacity"
                  inputMode="numeric"
                  value={draft}
                  placeholder="No limit"
                  onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onBlur={() => void saveCapacity()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="w-20 border-0 border-b border-[var(--rule)] bg-transparent px-0 t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
                />
              </span>
            ) : (
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className={ROW}>
                {limit ? `Capacity ${limit} · ${joined} joined · ${left} left` : `Capacity · no limit · ${joined} joined`}
              </button>
            )}
          </>
        ) : (
          <p className="mb-0 t-meta text-[var(--grey)]">
            Switch on to get a link anyone can use: they enter a name and a contact and get a pass. Share it in your channel.
          </p>
        )}
        {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      </div>
    </Zone>
  );
}
