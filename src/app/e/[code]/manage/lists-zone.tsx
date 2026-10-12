"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload } from "lucide-react";
import { Zone } from "@/shared/components/zone";
import { guestStatusView, type BookList, type GuestListReport, type GuestStatus, type NamePair } from "@/shared/event/guest-book";
import { cn } from "@/lib/utils";

const ACTION =
  "press border-0 bg-transparent p-0 t-meta text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function StatusMark({ status }: { status: GuestStatus }) {
  const view = guestStatusView(status);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 t-meta text-[var(--ink)]">
      {view.dot ? <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: view.dot }} /> : null}
      {view.label}
    </span>
  );
}

function listLine(list: BookList): string {
  return `${list.total} · ${list.email} email · ${list.phone} phone · ${list.going} going`;
}

export function ListsZone({
  lookup,
  lists,
  pairs,
  guestsHref,
}: {
  lookup: string;
  lists: BookList[];
  pairs: NamePair[];
  guestsHref: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BookList | null>(null);
  const [showPairs, setShowPairs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GuestListReport | null>(null);
  const base = `/api/events/${encodeURIComponent(lookup)}/guest-lists`;

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
      const response = await fetch(base, { method: "POST", body: form });
      const body = (await response.json()) as { report?: GuestListReport; error?: string };
      if (!response.ok || !body.report) {
        setError(body.error ?? "Could not read that file.");
        return;
      }
      setReport(body.report);
      setOpen(body.report.listId);
      router.refresh();
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, value: { name?: string; isPaid?: boolean }) =>
    call(
      `${base}/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) },
      "Could not save the list.",
    );

  const saveName = async () => {
    if (!renaming) return;
    const current = lists.find((list) => list.id === renaming.id);
    const name = renaming.name.trim();
    setRenaming(null);
    if (!name || name === current?.name) return;
    await patch(renaming.id, { name });
  };

  const remove = async (list: BookList) => {
    const done = await call(`${base}/${list.id}`, { method: "DELETE" }, "Could not delete the list.");
    if (done && open === list.id) setOpen(null);
  };

  const resolve = (pair: NamePair, action: "merge" | "keep") =>
    call(
      `${base}/pairs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: pair.a.id, b: pair.b.id, action }) },
      "Could not save that.",
    );

  const pairGuests = new Set(pairs.flatMap((pair) => [pair.a.id, pair.b.id])).size;

  return (
    <Zone label="Lists">
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
      {lists.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-4">
          {lists.map((list) => {
            const expanded = open === list.id;
            return (
              <li key={list.id}>
                {renaming?.id === list.id ? (
                  <input
                    autoFocus
                    aria-label="List name"
                    value={renaming.name}
                    maxLength={80}
                    onChange={(event) => setRenaming({ id: list.id, name: event.target.value })}
                    onBlur={() => void saveName()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    className="w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 t-body text-[var(--ink)] outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : list.id)}
                    className="press block w-full border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="flex items-baseline gap-2 t-body text-[var(--ink)]">
                      <span className="min-w-0 truncate">{list.name}</span>
                      {list.isPaid ? <span className="t-caps text-[var(--ink)]">Paid</span> : null}
                      <span aria-hidden className={cn("inline-block transition-transform", expanded && "rotate-90")}>
                        ›
                      </span>
                    </span>
                    <span className="mt-0.5 block t-meta text-[var(--grey)]">{listLine(list)}</span>
                  </button>
                )}
                {expanded ? (
                  <div className="mt-2">
                    {list.preview.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {list.preview.map((guest) => (
                          <li key={guest.key} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate t-meta text-[var(--ink)]">{guest.name}</span>
                            <StatusMark status={guest.status} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Link
                      href={`${guestsHref}?list=${encodeURIComponent(list.id)}`}
                      className="press mt-2 block t-meta text-[var(--ink)] no-underline [-webkit-tap-highlight-color:transparent]"
                    >
                      {`All ${list.total} ›`}
                    </Link>
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <button type="button" disabled={busy} className={ACTION} onClick={() => setRenaming({ id: list.id, name: list.name })}>
                        Rename
                      </button>
                      <button type="button" disabled={busy} className={ACTION} onClick={() => void patch(list.id, { isPaid: !list.isPaid })}>
                        {list.isPaid ? "Paid off" : "Paid on"}
                      </button>
                      <button type="button" disabled={busy} className={ACTION} onClick={() => setConfirmDelete(list)}>
                        Delete list
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {pairs.length > 0 ? (
        <div className="mb-4">
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
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="press inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
      >
        <Upload className="text-[var(--ink)]" size={16} strokeWidth={1.25} />
        {lists.length > 0 ? "Upload another list" : "Upload CSV or Excel"}
      </button>
      <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
        CSV or Excel: a name, and an email or a phone. The same person in two lists stays one guest.
      </p>
      {report ? (
        <div className="mt-3">
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
      {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      <Dialog.Root open={confirmDelete !== null} onOpenChange={(value) => !value && setConfirmDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
            <Dialog.Title className="t-body text-[var(--ink)]">Delete list</Dialog.Title>
            <Dialog.Description className="sr-only">
              Guests who are in no other list and not registered are removed too.
            </Dialog.Description>
            <div className="mt-3 flex justify-center gap-6">
              <button
                type="button"
                className="t-body text-[var(--ink)]"
                onClick={() => {
                  const list = confirmDelete;
                  setConfirmDelete(null);
                  if (list) void remove(list);
                }}
              >
                Yes
              </button>
              <button type="button" className="t-body text-[var(--grey)]" onClick={() => setConfirmDelete(null)}>
                No
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Zone>
  );
}
