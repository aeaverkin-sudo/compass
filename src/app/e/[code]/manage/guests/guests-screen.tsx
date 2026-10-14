"use client";

import { Fragment, startTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rule } from "@/shared/components/rule";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Switch } from "@/shared/components/ui/switch";
import { NUMBER_CLASS } from "@/shared/components/section-number";
import {
  guestPassUrl,
  isGoing,
  whatsappHref,
  whatsappInvite,
  type BookGuest,
  type BookList,
  type GuestPass,
  type NamePair,
} from "@/shared/event/guest-book";
import { guestSources, isPaidGuest, sourceNames } from "@/shared/event/guest-sources";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { ManageFrame } from "../manage-frame";
import { FilesZone } from "./files-zone";
import { MailPreview } from "./mail-preview";
import { HandZone } from "./hand-zone";
import { OpenLinkZone } from "./open-link-zone";

type Stage = "not_sent" | "sent" | "opened" | "confirmed";
type Sort = "recent" | "name";

const STAGES: { id: Stage; label: string }[] = [
  { id: "not_sent", label: "Not sent" },
  { id: "sent", label: "Sent" },
  { id: "opened", label: "Opened" },
  { id: "confirmed", label: "Confirmed" },
];

const CHIP = "press border-0 bg-transparent p-0 t-meta [-webkit-tap-highlight-color:transparent]";
const ROW =
  "press inline-flex items-center gap-2 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] no-underline disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const SKY =
  "press self-start border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";
const BOX = "border border-[var(--rule)] bg-white data-[state=checked]:border-[var(--ink)]";

function chipClass(selected: boolean): string {
  return `${CHIP} ${selected ? "text-[var(--ink)] underline decoration-1 underline-offset-[3px]" : "text-[var(--grey)]"}`;
}

function Chips<T extends string>({
  items,
  selected,
  onPick,
  separator = "·",
}: {
  items: { id: T; label: string }[];
  selected: T | null;
  onPick: (id: T) => void;
  separator?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <span className="t-meta text-[var(--grey)]">{separator}</span> : null}
          <button type="button" onClick={() => onPick(item.id)} className={chipClass(selected === item.id)}>
            {item.label}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function GuestsScreen({
  lookup,
  name,
  guests,
  lists,
  initialList,
  inviteUrl,
  isPaid,
  pairs,
  passes,
  openLink,
  mail,
  reminder,
}: {
  lookup: string;
  name: string;
  guests: BookGuest[];
  /** Null until guest lists exist. */
  lists: BookList[] | null;
  initialList: string | null;
  inviteUrl: string;
  isPaid: boolean;
  pairs: NamePair[];
  /** Phone-only guests: their links go out by hand. */
  passes: GuestPass[];
  openLink: { open: boolean; capacity: number | null; joined: number };
  /** `preview` is the body of the invitation, laid out on the cabinet's column. */
  mail: { ready: boolean; preview: string | null };
  reminder: { ready: boolean; enabled: boolean; sentLabel: string | null };
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [rows, setRows] = useState(guests);
  const [shownGuests, setShownGuests] = useState(guests);
  if (shownGuests !== guests) {
    setShownGuests(guests);
    setRows(guests);
  }
  const books = lists ?? [];
  const sources = guestSources(rows, books);
  const [open, setOpen] = useState(Boolean(initialList));
  const [stage, setStage] = useState<Stage | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [picked, setPicked] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [viewing, setViewing] = useState(false);
  const [remind, setRemind] = useState(reminder.enabled);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy: running, run } = useBusyAction<"send" | "reminder">();
  const sendLock = useRef(false);

  const recount = () => startTransition(() => router.refresh());

  const confirmed = (guest: BookGuest) => (isPaid ? isPaidGuest(guest) : isGoing(guest.status));
  const MATCH: Record<Stage, (guest: BookGuest) => boolean> = {
    not_sent: (guest) => Boolean(guest.guestId) && !guest.sent && !confirmed(guest),
    sent: (guest) => Boolean(guest.guestId) && guest.sent,
    opened: (guest) => Boolean(guest.guestId) && guest.sent && (guest.opened || isGoing(guest.status)),
    confirmed,
  };
  const stageOf = (guest: BookGuest): string => {
    if (confirmed(guest)) return "Confirmed";
    if (guest.bounced) return "Bounced";
    if (guest.opened || isGoing(guest.status) || guest.status === "declined") return "Opened";
    if (guest.sent) return "Sent";
    return "Not sent";
  };
  const pendingMail = (guest: BookGuest) =>
    Boolean(guest.guestId && guest.email) && !guest.sent && !guest.bounced && !guest.unsubscribed;

  const sentCount = rows.filter(MATCH.sent).length;
  const confirmedCount = rows.filter(confirmed).length;
  const statusLine = STAGES.map((item) => `${item.label} ${rows.filter(MATCH[item.id]).length}`).join(" · ");

  const stamp = (guest: BookGuest) => guest.registeredAt ?? guest.addedAt ?? "";
  const visible = rows
    .filter((guest) => !stage || MATCH[stage](guest))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : stamp(b).localeCompare(stamp(a))));

  const manual = new Set(books.filter((list) => list.kind === "manual").map((list) => list.id));
  const isByHand = (guest: BookGuest) => guest.listIds.some((id) => manual.has(id));
  const byHand = visible.filter(isByHand);
  const imported = visible.filter((guest) => !isByHand(guest));

  const allTicked = visible.length > 0 && visible.every((guest) => ticked.has(guest.key));
  const tickAll = () =>
    setTicked((current) => {
      const next = new Set(current);
      for (const guest of visible) {
        if (allTicked) next.delete(guest.key);
        else next.add(guest.key);
      }
      return next;
    });
  const tick = (key: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const eligible = rows.filter(pendingMail);
  const targets = ticked.size > 0 ? eligible.filter((guest) => ticked.has(guest.key)) : eligible;

  const send = () =>
    run("send", async () => {
      if (sendLock.current || targets.length === 0) return;
      sendLock.current = true;
      setError(null);
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ticked.size > 0 ? { guestIds: targets.map((guest) => guest.guestId) } : {}),
        });
        const body = (await response.json()) as { sent?: number; failed?: number; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not send.");
        if (body.failed) setError(`${body.failed} not sent. They stay Not sent — try again later.`);
        else setNotice(`Sent ${body.sent ?? targets.length}`);
        setTicked(new Set());
        // Who was sent comes back from the server only as counts.
        recount();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not send.");
      } finally {
        sendLock.current = false;
      }
    });

  const toggleReminder = (next: boolean) =>
    run("reminder", async () => {
      setRemind(next);
      setError(null);
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/reminder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: next }),
        });
        if (!response.ok) throw new Error();
      } catch {
        setRemind(!next);
        setError("Could not save.");
      }
    });

  const copy = async (text: string, done: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice("Could not copy");
    }
  };

  const copyLinks = () =>
    void copy(passes.map((pass) => `${pass.name} — ${guestPassUrl(inviteUrl, pass.token)}`).join("\n"), "Links copied");

  const metaLine = (guest: BookGuest): string =>
    [guest.email ?? guest.phone, ...sourceNames(guest, books)].filter(Boolean).join(" · ");

  const guestRow = (guest: BookGuest, index: number) => {
    const pass = guest.token ? guestPassUrl(inviteUrl, guest.token) : null;
    const whatsapp = guest.phone && pass ? whatsappHref(guest.phone, whatsappInvite(name, pass)) : null;
    const expanded = whatsapp !== null && picked === guest.key;
    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block truncate t-body text-[var(--ink)]">{guest.name}</span>
          <span className="mt-0.5 block truncate t-meta text-[var(--grey)]">{metaLine(guest)}</span>
        </span>
        <span className="inline-flex shrink-0 items-baseline gap-1 t-meta text-[var(--ink)]">
          {isPaid && isPaidGuest(guest) ? <span className="text-[var(--pay-confirmed)]">$</span> : null}
          {stageOf(guest)}
        </span>
      </>
    );
    return (
      <li key={guest.key}>
        {index > 0 ? <Rule /> : null}
        <div className="flex items-start gap-3 py-2">
          <Checkbox
            checked={ticked.has(guest.key)}
            onCheckedChange={(checked) => tick(guest.key, checked === true)}
            className={cn(BOX, "mt-[3px]")}
            aria-label={`Mark ${guest.name}`}
          />
          {whatsapp ? (
            <button
              type="button"
              onClick={() => setPicked(expanded ? null : guest.key)}
              className="press flex min-w-0 flex-1 items-baseline gap-2 border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
            >
              {body}
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 items-baseline gap-2">{body}</span>
          )}
        </div>
        {expanded ? (
          <span className="flex pb-3 pl-7">
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="t-meta text-[var(--ink)] underline decoration-1 underline-offset-[3px]"
            >
              WhatsApp
            </a>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <ManageFrame title="Guests" fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div className="pt-[18px] pb-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <p className={cn(NUMBER_CLASS, "mb-0")}>{`${rows.length} guests`}</p>
        <p className="mt-2 mb-0 t-body text-[var(--ink)]">{`${sentCount} sent · ${confirmedCount} confirmed`}</p>
      </div>
      <Rule />
      <FilesZone
        lookup={lookup}
        files={sources.filter((item) => item.kind === "file")}
        pairs={pairs}
        onPick={() => setOpen(true)}
        onChanged={recount}
      />
      <OpenLinkZone
        lookup={lookup}
        open={openLink.open}
        capacity={openLink.capacity}
        joined={openLink.joined}
        shareUrl={inviteUrl}
        onNotice={setNotice}
      />
      <Zone
        label={
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="press inline-flex items-center gap-1 border-0 bg-transparent p-0 t-label text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            The list
            <ChevronDown size={14} strokeWidth={1.25} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        }
        align="start"
      >
        {open ? (
          <Chips
            items={STAGES.map((item) => ({ id: item.id, label: `${item.label} ${rows.filter(MATCH[item.id]).length}` }))}
            selected={stage}
            onPick={(id) => setStage((current) => (current === id ? null : id))}
          />
        ) : (
          <p className="mb-0 t-meta text-[var(--grey)]">{statusLine}</p>
        )}
      </Zone>
      {open ? (
        <div className="pb-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="t-meta text-[var(--grey)]">Sort ·</span>
                <Chips
                  items={[
                    { id: "recent" as Sort, label: "Recent" },
                    { id: "name" as Sort, label: "By name" },
                  ]}
                  selected={sort}
                  onPick={setSort}
                  separator="/"
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 t-meta text-[var(--ink)]">
                Mark all
                <Checkbox checked={allTicked} onCheckedChange={tickAll} className={BOX} aria-label="Mark all" />
              </label>
            </div>
            <HandZone
              lookup={lookup}
              onAdded={(text) => {
                setNotice(text);
                recount();
              }}
            >
              {byHand.length > 0 ? <ul className="mt-2">{byHand.map(guestRow)}</ul> : null}
            </HandZone>
            <ul className="max-h-[max(176px,min(324px,calc(100dvh-484px)))] overflow-y-auto overscroll-contain">
              {imported.map(guestRow)}
            </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 border-t border-[var(--rule)] py-[18px]">
          {mail.preview ? (
            <button type="button" aria-expanded={viewing} onClick={() => setViewing((value) => !value)} className={ROW}>
              View invitation
            </button>
          ) : null}
          {viewing && mail.preview ? <MailPreview html={mail.preview} /> : null}
          {reminder.ready ? (
            reminder.sentLabel ? (
              <p className="mb-0 t-meta text-[var(--grey)]">{`Reminder sent ${reminder.sentLabel}`}</p>
            ) : (
              <div className="flex items-center gap-3">
                <Switch
                  checked={remind}
                  disabled={running !== null}
                  onCheckedChange={(checked) => void toggleReminder(checked === true)}
                  aria-label="Reminder 24h before"
                />
                <span className="t-meta text-[var(--grey)]">{`Reminder 24h before · ${remind ? "on" : "off"}`}</span>
              </div>
            )
          ) : null}
          {!mail.ready ? (
            <p className="mb-0 t-meta text-[var(--grey)]">Sending needs the event mails migration.</p>
          ) : eligible.length > 0 ? (
            <button type="button" disabled={running !== null || targets.length === 0} onClick={() => void send()} className={SKY}>
              {running === "send" ? "Sending…" : `Send invitation · ${targets.length} by mail`}
            </button>
          ) : rows.some((guest) => guest.email) ? (
            <p className="mb-0 t-meta text-[var(--grey)]">All passes sent</p>
          ) : null}
          {passes.length > 0 ? (
            <p className="mb-0 t-meta text-[var(--grey)]">
              {`${passes.length} phone only — `}
              <button
                type="button"
                onClick={copyLinks}
                className="press border-0 bg-transparent p-0 t-meta text-[var(--grey)] underline underline-offset-2 [-webkit-tap-highlight-color:transparent]"
              >
                copy links
              </button>
              {" for WhatsApp"}
            </p>
          ) : null}
          {error ? <p className="mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      </div>
      <Rule />
      <div className="py-[18px]" style={{ marginLeft: VALUE_AXIS_PX }}>
        <a href={`/api/events/${encodeURIComponent(lookup)}/guests/export`} download className={ROW}>
          <Download size={16} strokeWidth={1.25} className="shrink-0 text-[var(--ink)]" />
          Export guest list
        </a>
      </div>
    </ManageFrame>
  );
}
