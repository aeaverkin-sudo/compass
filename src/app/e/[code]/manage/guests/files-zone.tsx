"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { Zone } from "@/shared/components/zone";
import type { GuestListReport, NamePair } from "@/shared/event/guest-book";
import type { GuestSource } from "@/shared/event/guest-sources";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { useLongPress } from "@/shared/hooks/use-long-press";

const ROW =
  "press inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] no-underline disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const ACTION =
  "press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const ICON = { size: 16, strokeWidth: 1.25, className: "shrink-0 text-[var(--ink)]" } as const;
const LONG_PRESS_MS = 500;

function SourceRow({ source, onPick, onHold }: { source: GuestSource; onPick: () => void; onHold: () => void }) {
  const press = useLongPress(onHold, LONG_PRESS_MS);
  return (
    <li>
      <button
        type="button"
        {...press}
        onClick={(event) => {
          press.onClick(event);
          if (!event.defaultPrevented) onPick();
        }}
        className="press flex w-full items-baseline gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
      >
        <span className="min-w-0 truncate">{`${source.name} · ${source.total}`}</span>
        {source.isPaid ? <span className="t-caps">Paid</span> : null}
      </button>
    </li>
  );
}

export function FilesZone({
  lookup,
  files,
  pairs,
  onPick,
  onChanged,
}: {
  lookup: string;
  /** Uploaded files only. */
  files: GuestSource[];
  pairs: NamePair[];
  onPick: (sourceId: string) => void;
  /** Lists and counters are counted on the server. */
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useState<GuestSource | null>(null);
  const [showPairs, setShowPairs] = useState(false);
  const { busy: running, run } = useBusyAction<"upload" | "save">();
  const busy = running !== null;
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GuestListReport | null>(null);
  const base = `/api/events/${encodeURIComponent(lookup)}`;

  const call = (url: string, init: RequestInit, fallback: string) =>
    run("save", async () => {
      setError(null);
      try {
        const response = await fetch(url, init);
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? fallback);
          return;
        }
        onChanged();
      } catch {
        setError(fallback);
      }
    });

  const upload = (file: File) =>
    run("upload", async () => {
      setError(null);
      setReport(null);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(`${base}/guest-lists`, { method: "POST", body: form });
        const body = (await response.json()) as { report?: GuestListReport; error?: string };
        if (!response.ok || !body.report) {
          setError(body.error ?? "Could not read that file.");
          return;
        }
        setReport(body.report);
        onChanged();
      } catch {
        setError("Could not read that file.");
      }
    });

  const resolve = (pair: NamePair, action: "merge" | "keep") =>
    call(
      `${base}/guest-lists/pairs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: pair.a.id, b: pair.b.id, action }) },
      "Could not save that.",
    );

  const pairGuests = new Set(pairs.flatMap((pair) => [pair.a.id, pair.b.id])).size;

  return (
    <Zone label="Files" align="start" rule>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-col gap-3">
        {files.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {files.map((source) => (
              <SourceRow key={source.id} source={source} onPick={() => onPick(source.id)} onHold={() => setHeld(source)} />
            ))}
          </ul>
        ) : null}
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={ROW}>
          <Upload {...ICON} />
          {running === "upload" ? "Uploading…" : "Upload guest list"}
        </button>
        {pairs.length > 0 ? (
          <div>
            <button
              type="button"
              aria-expanded={showPairs}
              onClick={() => setShowPairs((value) => !value)}
              className="press block border-0 bg-transparent p-0 text-left t-meta text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
            >
              {`${pairGuests} guests share a name but not a contact — check`}
            </button>
            {showPairs ? (
              <ul className="mt-2 flex flex-col gap-3">
                {pairs.map((pair) => (
                  <li key={`${pair.a.id}-${pair.b.id}`}>
                    {[pair.a, pair.b].map((side) => (
                      <span key={side.id} className="block t-meta text-[var(--grey)]">
                        <span className="text-[var(--ink)]">{side.name}</span>
                        {` · ${[side.contact, side.lists].filter(Boolean).join(" · ")}`}
                      </span>
                    ))}
                    <span className="mt-1 flex gap-4">
                      <button type="button" disabled={busy} className={ACTION} onClick={() => void resolve(pair, "merge")}>
                        Merge
                      </button>
                      <button type="button" disabled={busy} className={ACTION} onClick={() => void resolve(pair, "keep")}>
                        Keep both
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {report ? (
          <div>
            <p className="mb-0 t-meta text-[var(--grey)]">
              {`${report.name}: ${report.added} new · ${report.merged} already on a list · ${report.skipped.length} rows skipped`}
            </p>
            {report.skipped.length > 0 ? (
              <ul className="mt-2">
                {report.skipped.map((line) => (
                  <li key={line.row} className="t-meta text-[var(--grey)]">
                    {`Row ${line.row} · ${line.text || "empty"}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      </div>
      <Dialog.Root open={held !== null} onOpenChange={(value) => !value && setHeld(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,300px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
            <Dialog.Title className="t-body text-[var(--ink)]">{held?.name}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Guests who are on no other list and not registered are removed.
            </Dialog.Description>
            <div className="mt-3 flex flex-col items-center gap-3">
              <button
                type="button"
                className="t-body text-[var(--ink)]"
                onClick={() => {
                  const source = held;
                  setHeld(null);
                  if (source) void call(`${base}/guest-lists/${source.id}`, { method: "DELETE" }, "Could not remove the file.");
                }}
              >
                {held ? `Remove ${held.total} ${held.total === 1 ? "guest" : "guests"} from this file` : ""}
              </button>
              <button
                type="button"
                className="t-body text-[var(--ink)]"
                onClick={() => {
                  const source = held;
                  setHeld(null);
                  if (source) {
                    void call(
                      `${base}/guest-lists/${source.id}`,
                      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPaid: !source.isPaid }) },
                      "Could not save the list.",
                    );
                  }
                }}
              >
                {held?.isPaid ? "Paid off" : "Paid on"}
              </button>
              <button type="button" className="t-body text-[var(--grey)]" onClick={() => setHeld(null)}>
                Cancel
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Zone>
  );
}
