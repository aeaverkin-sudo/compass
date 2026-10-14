"use client";

import { useState, type ReactNode } from "react";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import type { GuestListReport } from "@/shared/event/guest-book";

const FIELD =
  "w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 pb-1 t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const LINK =
  "press border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

function added(report: GuestListReport): string {
  const people = report.added + report.merged;
  return people === 1 ? "Guest added" : `${people} guests added`;
}

/** Under the search line, closed by a line: the add form, then the people added by hand who have not had the invite. */
export function HandZone({
  lookup,
  children,
  onAdded,
}: {
  lookup: string;
  children: ReactNode;
  onAdded: (notice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const { busy, run } = useBusyAction<"one" | "paste">();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GuestListReport | null>(null);

  const send = async (body: object): Promise<GuestListReport | string> => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/guests/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { report?: GuestListReport; error?: string };
      if (!response.ok || !payload.report) return payload.error ?? "Could not save.";
      return payload.report;
    } catch {
      return "Could not save.";
    }
  };

  const addOne = async () => {
    if (!name.trim() || !contact.trim()) return;
    setError(null);
    const result = await run("one", () => send({ name, contact }));
    if (result === undefined) return;
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setName("");
    setContact("");
    onAdded(added(result));
  };

  const addPasted = async () => {
    setError(null);
    setReport(null);
    const result = await run("paste", () => send({ text }));
    if (result === undefined) return;
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setText("");
    setReport(result);
    onAdded(added(result));
  };

  return (
    <div className="border-b border-[var(--rule)] py-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={LINK}>
        + Add a guest by hand
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {paste ? (
            <>
              <textarea
                aria-label="Paste guests"
                value={text}
                rows={4}
                onChange={(event) => setText(event.target.value)}
                className={`${FIELD} min-h-24 resize-none`}
              />
              <p className="mb-0 t-meta text-[var(--grey)]">
                One guest per line: a name, then an email or a phone. Copied from notes or a chat.
              </p>
              <span className="flex items-center gap-4">
                <button type="button" disabled={busy !== null || !text.trim()} onClick={() => void addPasted()} className={SKY}>
                  {busy === "paste" ? "Adding…" : "Add"}
                </button>
                <button type="button" onClick={() => setPaste(false)} className="press border-0 bg-transparent p-0 t-meta text-[var(--grey)]">
                  One guest
                </button>
              </span>
              {report ? (
                <p className="mb-0 t-meta text-[var(--grey)]">
                  {`${report.added} new · ${report.merged} already on a list · ${report.skipped.length} lines skipped`}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <input
                aria-label="Name"
                placeholder="Name"
                value={name}
                maxLength={200}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
                className={FIELD}
              />
              <input
                aria-label="Email or phone"
                placeholder="Email or phone"
                value={contact}
                maxLength={200}
                autoComplete="off"
                onChange={(event) => setContact(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addOne();
                }}
                className={FIELD}
              />
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={busy !== null || !name.trim() || !contact.trim()}
                  onClick={() => void addOne()}
                  className={SKY}
                >
                  {busy === "one" ? "Adding…" : "Add"}
                </button>
                <button type="button" onClick={() => setPaste(true)} className="press border-0 bg-transparent p-0 t-meta text-[var(--grey)]">
                  Paste a list
                </button>
              </span>
            </>
          )}
          {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
