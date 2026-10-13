"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Plus, Upload } from "lucide-react";
import { Switch } from "@/shared/components/ui/switch";
import { Zone } from "@/shared/components/zone";
import { guestPassUrl, type GuestListReport, type GuestPass, type NamePair } from "@/shared/event/guest-book";
import type { GuestSource } from "@/shared/event/guest-sources";
import { useLongPress } from "@/shared/hooks/use-long-press";

const ROW =
  "press inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] no-underline disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const ACTION =
  "press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const SKY =
  "press self-start border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]";
const ICON = { size: 16, strokeWidth: 1.25, className: "shrink-0 text-[var(--ink)]" } as const;
const LONG_PRESS_MS = 500;

function sourceLine(source: GuestSource): string {
  if (source.kind === "open") return `${source.total} joined`;
  const parts = [String(source.total)];
  if (source.email > 0) parts.push(`${source.email} email`);
  if (source.phone > 0) parts.push(`${source.phone} phone`);
  return parts.join(" · ");
}

function SourceRow({ source, href, onHold }: { source: GuestSource; href: string; onHold: (source: GuestSource) => void }) {
  const press = useLongPress(() => onHold(source), LONG_PRESS_MS);
  const holdable = source.kind === "file";
  return (
    <li>
      <Link
        href={href}
        {...(holdable ? press : {})}
        className="press block text-[var(--ink)] no-underline select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
      >
        <span className="flex items-baseline gap-2 t-body">
          <span className="min-w-0 truncate">{source.name}</span>
          {source.isPaid ? <span className="t-caps">Paid</span> : null}
        </span>
        <span className="mt-0.5 block t-meta text-[var(--grey)]">{sourceLine(source)}</span>
      </Link>
    </li>
  );
}

export function GuestsZone({
  lookup,
  guestsHref,
  addHref,
  sendHref,
  mail,
  reminder,
  counter,
  sources,
  pairs,
  passes,
  inviteUrl,
  sent,
  showGoing,
  compact,
  onNotice,
}: {
  lookup: string;
  guestsHref: string;
  addHref: string;
  sendHref: string;
  /** Guests with an email who have not had the invite, and all guests with an email. */
  mail: { ready: boolean; pending: number; withEmail: number };
  /** Reminder 24h before. `sentLabel` once it went. */
  reminder: { ready: boolean; enabled: boolean; sentLabel: string | null };
  /** `164 · 57 going · 43 paid · 0 in`. */
  counter: string;
  sources: GuestSource[];
  pairs: NamePair[];
  /** Phone-only guests: their links go out by hand. */
  passes: GuestPass[];
  inviteUrl: string;
  sent: { sent: number; opened: number; going: number };
  showGoing: boolean;
  /** After the event: the counter and the export. */
  compact: boolean;
  onNotice: (text: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useState<GuestSource | null>(null);
  const [going, setGoing] = useState(showGoing);
  const [remind, setRemind] = useState(reminder.enabled);
  const [showPairs, setShowPairs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GuestListReport | null>(null);
  const base = `/api/events/${encodeURIComponent(lookup)}`;
  const exportHref = `${base}/guests/export`;
  const empty = sources.length === 0;

  const call = async (url: string, init: RequestInit, fallback: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? fallback);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
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
      router.refresh();
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const toggleGoing = async (next: boolean) => {
    setGoing(next);
    const done = await call(
      `${base}/going`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: next }) },
      "Could not save.",
    );
    if (!done) setGoing(!next);
  };

  const toggleReminder = async (next: boolean) => {
    setRemind(next);
    const done = await call(
      `${base}/reminder`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: next }) },
      "Could not save.",
    );
    if (!done) setRemind(!next);
  };

  const resolve = (pair: NamePair, action: "merge" | "keep") =>
    call(
      `${base}/guest-lists/pairs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: pair.a.id, b: pair.b.id, action }) },
      "Could not save that.",
    );

  const copyLinks = async () => {
    const text = passes.map((pass) => `${pass.name} — ${guestPassUrl(inviteUrl, pass.token)}`).join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      onNotice("Links copied");
    } catch {
      onNotice("Could not copy");
    }
  };

  const filtered = (id: string) => `${guestsHref}?list=${encodeURIComponent(id)}`;
  const pairGuests = new Set(pairs.flatMap((pair) => [pair.a.id, pair.b.id])).size;

  const exportRow = (
    <a href={exportHref} download className={ROW}>
      <Download {...ICON} />
      Export guests
    </a>
  );

  if (compact) {
    return (
      <Zone label="Guests" align="start">
        <div className="flex flex-col gap-3">
          <Link href={guestsHref} className={ROW}>
            {`${counter} ›`}
          </Link>
          {exportRow}
        </div>
      </Zone>
    );
  }

  return (
    <Zone label="Guests" align="start">
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
      <div className="flex flex-col gap-4">
        {empty ? (
          <p className="mb-0 t-body text-[var(--grey)]">Nobody yet</p>
        ) : (
          <>
            <Link href={guestsHref} className={ROW}>
              {`${counter} ›`}
            </Link>
            <ul className="flex flex-col gap-4">
              {sources.map((source) => (
                <SourceRow key={source.id} source={source} href={filtered(source.id)} onHold={setHeld} />
              ))}
            </ul>
          </>
        )}
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
        <div className="flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={ROW}>
            <Upload {...ICON} />
            Upload file
          </button>
          <Link href={addHref} className={ROW}>
            <Plus {...ICON} />
            Add by hand
          </Link>
        </div>
        {empty ? (
          <p className="mb-0 t-meta text-[var(--grey)]">
            A file, or one person at a time: a name and an email or a phone. Then send them their passes. Or switch the open link on.
          </p>
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
        {mail.ready && mail.pending > 0 ? (
          <Link href={sendHref} className={SKY}>
            {`Send ${mail.pending} ${mail.pending === 1 ? "pass" : "passes"}`}
          </Link>
        ) : mail.ready && mail.withEmail > 0 ? (
          <p className="mb-0 t-meta text-[var(--grey)]">All passes sent</p>
        ) : null}
        {passes.length > 0 ? (
          <p className="mb-0 t-meta text-[var(--grey)]">
            {`${passes.length} phone only — `}
            <button
              type="button"
              onClick={() => void copyLinks()}
              className="press border-0 bg-transparent p-0 t-meta text-[var(--grey)] underline underline-offset-2 [-webkit-tap-highlight-color:transparent]"
            >
              copy links
            </button>
            {" for WhatsApp"}
          </p>
        ) : null}
        {sent.sent > 0 ? (
          <p className="mb-0 t-body text-[var(--ink)]">{`Sent ${sent.sent} · Opened ${sent.opened} · Going ${sent.going}`}</p>
        ) : null}
        {!empty ? exportRow : null}
        {reminder.ready ? (
          reminder.sentLabel ? (
            <p className="mb-0 t-meta text-[var(--grey)]">{`Reminder sent ${reminder.sentLabel}`}</p>
          ) : (
            <div className="flex items-center gap-3">
              <Switch
                checked={remind}
                disabled={busy}
                onCheckedChange={(checked) => void toggleReminder(checked === true)}
                aria-label="Reminder 24h before"
              />
              <span className="t-meta text-[var(--grey)]">{`Reminder 24h before · ${remind ? "on" : "off"}`}</span>
            </div>
          )
        ) : null}
        <div className="flex items-center gap-3">
          <Switch checked={going} disabled={busy} onCheckedChange={(checked) => void toggleGoing(checked === true)} aria-label="Guests see who's going" />
          <span className="t-meta text-[var(--grey)]">{`Guests see who's going · ${going ? "on" : "off"}`}</span>
        </div>
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
