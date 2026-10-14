"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import type { GuestListReport } from "@/shared/event/guest-book";
import { ManageFrame } from "../../manage-frame";

const FIELD =
  "w-full border-0 bg-transparent px-0 t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function added(report: GuestListReport): string {
  const people = report.added + report.merged;
  return people === 1 ? "Guest added" : `${people} guests added`;
}

export function AddGuestsScreen({ lookup }: { lookup: string }) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const { busy, run } = useBusyAction<"one" | "paste">();
  const [error, setError] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [report, setReport] = useState<GuestListReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(added(result));
  };

  const addPasted = async () => {
    setPasteError(null);
    setReport(null);
    const result = await run("paste", () => send({ text }));
    if (result === undefined) return;
    if (typeof result === "string") {
      setPasteError(result);
      return;
    }
    setText("");
    setReport(result);
    setNotice(added(result));
  };

  return (
    <ManageFrame title="Add guests" fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <Rule className="mt-[18px]" />
      <Zone label="Name">
        <input
          aria-label="Name"
          value={name}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          className={FIELD}
        />
      </Zone>
      <Rule />
      <Zone label="Email or phone" align="start">
        <input
          aria-label="Email or phone"
          value={contact}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => setContact(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addOne();
          }}
          className={FIELD}
        />
        <button type="button" disabled={busy !== null || !name.trim() || !contact.trim()} onClick={() => void addOne()} className={`mt-4 ${SKY}`}>
          {busy === "one" ? "Adding…" : "Add"}
        </button>
        <p className="mt-3 mb-0 t-meta text-[var(--grey)]">Goes to «Added by hand».</p>
        {error ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      </Zone>
      <Rule />
      <Zone label="Paste" align="start">
        <textarea
          aria-label="Paste guests"
          value={text}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          className={`${FIELD} min-h-32 resize-none`}
        />
        <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
          One guest per line: a name, then an email or a phone. Copied from notes or a chat.
        </p>
        <button type="button" disabled={busy !== null || !text.trim()} onClick={() => void addPasted()} className={`mt-4 ${SKY}`}>
          {busy === "paste" ? "Adding…" : "Add"}
        </button>
        {report ? (
          <div className="mt-3">
            <p className="mb-0 t-meta text-[var(--grey)]">
              {`${report.added} new · ${report.merged} already on a list · ${report.skipped.length} lines skipped`}
            </p>
            {report.skipped.length > 0 ? (
              <ul className="mt-2">
                {report.skipped.map((line) => (
                  <li key={line.row} className="t-meta text-[var(--grey)]">
                    {`Line ${line.row} · ${line.text || "empty"}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {pasteError ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{pasteError}</p> : null}
      </Zone>
    </ManageFrame>
  );
}
