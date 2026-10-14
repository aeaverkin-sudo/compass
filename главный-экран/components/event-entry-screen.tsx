"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SkyToast } from "@/shared/components/sky-toast";
import { DeclinedRow, InvitedBlock, type InboxDeclined, type InboxInvite } from "./invited-block";
import { Zone } from "@/shared/components/zone";
import { EventForm } from "@/shared/event/event-form";
import { appendEventFields, type EventFormValues } from "@/shared/event/event-form-fields";
import { isEventLayout, isEventTheme } from "@/shared/event/themes";
import { isInviteLogoLook, readInviteRows } from "@/shared/event/invite-rows";
import { inviteDateText, inviteTimeText } from "@/shared/event/invite-when";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { NetworkBand } from "@/app/network/network-band";
import { eventTitleLine } from "@/shared/event/event-title";
import { DEFAULT_EVENT_TIME_ZONE, browserTimeZone, isTimeZone } from "@/shared/event/time-zone";

type Step = "entry" | "create";

type ListedEvent = {
  name: string;
  publicToken: string;
  when: string | null;
  role: "owner" | "manager" | "guest";
  status?: "draft" | "live" | "past";
  place?: string | null;
  pass?: { cardName: string; photoUrl: string | null } | null;
};

export const GOING_TOAST_MS = 2500;

export function goingToast(eventName: string): string {
  return `You're going to ${eventTitleLine(eventName)}`;
}

const LINK = "press text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

const DRAFT_KEY = "aded:event-draft";
const DRAFT_TTL_MS = 60 * 60 * 1000;

type EventDraft = EventFormValues & { savedAt: number };

const EMPTY_FORM: EventFormValues = {
  name: "",
  date: "",
  time: "",
  endTime: "",
  place: "",
  about: "",
  theme: "paper",
  layout: "card",
  themeTouched: false,
  inviteRows: [],
  logoLook: null,
  dateText: "",
  timeText: "",
  timeZone: DEFAULT_EVENT_TIME_ZONE,
};

function isDraftString(value: unknown): value is string {
  return typeof value === "string";
}

function readEventDraft(): EventDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<EventDraft>;
    if (
      !data ||
      typeof data.savedAt !== "number" ||
      !Number.isFinite(data.savedAt) ||
      Date.now() - data.savedAt > DRAFT_TTL_MS
    ) {
      return null;
    }
    const theme = data.theme ?? "";
    const layout = data.layout ?? "";
    if (
      !isDraftString(data.name) ||
      !isDraftString(data.date) ||
      !isDraftString(data.time) ||
      !isDraftString(data.endTime) ||
      !isDraftString(data.place) ||
      !isDraftString(data.about) ||
      typeof data.themeTouched !== "boolean" ||
      !isEventTheme(theme) ||
      !isEventLayout(layout)
    ) {
      return null;
    }
    return {
      name: data.name,
      date: data.date,
      time: data.time,
      endTime: data.endTime,
      place: data.place,
      about: data.about,
      theme,
      layout,
      themeTouched: data.themeTouched,
      inviteRows: readInviteRows(data.inviteRows),
      logoLook: isInviteLogoLook(data.logoLook) ? data.logoLook : null,
      dateText: isDraftString(data.dateText) ? data.dateText : inviteDateText(data.date),
      timeText: isDraftString(data.timeText) ? data.timeText : inviteTimeText(data.time, data.endTime),
      timeZone: isTimeZone(data.timeZone) ? data.timeZone : browserTimeZone(),
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}

function writeEventDraft(fields: EventFormValues) {
  try {
    const draft: EventDraft = { ...fields, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode or a blocked store: the form still works */
  }
}

function clearEventDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode or a blocked store */
  }
}

function sameDraft(a: EventFormValues, b: EventFormValues) {
  return (
    a.name === b.name &&
    a.date === b.date &&
    a.time === b.time &&
    a.endTime === b.endTime &&
    a.place === b.place &&
    a.about === b.about &&
    a.theme === b.theme &&
    a.layout === b.layout &&
    a.themeTouched === b.themeTouched &&
    a.logoLook === b.logoLook &&
    a.dateText === b.dateText &&
    a.timeText === b.timeText &&
    a.timeZone === b.timeZone &&
    JSON.stringify(a.inviteRows) === JSON.stringify(b.inviteRows)
  );
}

function roleLine(event: ListedEvent): string {
  const role = event.role === "owner" ? "Owner" : event.role === "manager" ? "Manager" : "Guest";
  return `${role} · ${event.when ?? "No date"}`;
}

function goingLine(event: ListedEvent): string {
  return ["Going", event.when, event.place].filter(Boolean).join(" · ");
}

/** An event I'm going to: the green dot, where and when, and the card I wear. */
function GoingRow({ event }: { event: ListedEvent }) {
  return (
    <>
      <span className="flex items-center gap-2 t-body text-[var(--ink)]">
        <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--pay-confirmed)]" />
        <span className="min-w-0 truncate">{`${eventTitleLine(event.name)} ›`}</span>
      </span>
      <span className="mt-1 block t-meta text-[var(--grey)]">{goingLine(event)}</span>
      {event.pass ? (
        <span className="mt-2 flex items-center gap-2 t-meta text-[var(--grey)]">
          {event.pass.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.pass.photoUrl} alt="" className="size-[22px] shrink-0 object-cover" />
          ) : (
            <span aria-hidden className="size-[22px] shrink-0 bg-[#f3f3f3]" />
          )}
          <span className="min-w-0 truncate">{`Your pass · ${event.pass.cardName}`}</span>
        </span>
      ) : null}
    </>
  );
}

function EventGroup({
  label,
  events,
  muted = false,
  onOpen,
  after = null,
}: {
  label: string;
  events: ListedEvent[];
  muted?: boolean;
  onOpen: (event: ListedEvent) => void;
  /** More rows at the end of the list. */
  after?: ReactNode;
}) {
  return (
    <section>
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
      >
        <span className="t-label pt-[14px]">{label}</span>
        <ul>
          {events.map((event) => (
            <li key={event.publicToken}>
              <button
                type="button"
                onClick={() => onOpen(event)}
                className="press block w-full py-[14px] text-left [-webkit-tap-highlight-color:transparent]"
              >
                {!muted && event.role === "guest" ? (
                  <GoingRow event={event} />
                ) : (
                  <>
                    <span className={muted ? "block t-body text-[var(--grey)]" : "block t-body text-[var(--ink)]"}>
                      {eventTitleLine(event.name)}
                    </span>
                    <span className="mt-1 block t-meta text-[var(--grey)]">{roleLine(event)}</span>
                  </>
                )}
              </button>
            </li>
          ))}
          {after}
        </ul>
      </div>
    </section>
  );
}

function ActionLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={LINK}>
      {children}
    </button>
  );
}

/** Event door and create. */
export function EventEntryScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("entry");
  const [values, setValues] = useState<EventFormValues>(EMPTY_FORM);
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [events, setEvents] = useState<ListedEvent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [invited, setInvited] = useState<InboxInvite[]>([]);
  const [declined, setDeclined] = useState<InboxDeclined[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const logoFile = useRef<File | null>(null);
  const savingLock = useRef(false);
  const draftReady = useRef(false);
  /** Restored fields. Don't write them back and refresh the hour. */
  const draftEcho = useRef<EventFormValues | null>(null);

  useEffect(() => {
    if (!draftReady.current || step !== "create") return;
    if (draftEcho.current && sameDraft(draftEcho.current, values)) return;
    draftEcho.current = null;
    writeEventDraft(values);
  }, [step, values]);

  /** The draft comes back the first time the form opens. */
  const openCreate = () => {
    if (!draftReady.current) {
      const draft = readEventDraft();
      if (draft) {
        const { savedAt, ...fields } = draft;
        void savedAt;
        setValues(fields);
        draftEcho.current = fields;
      } else {
        clearEventDraft();
        setValues((current) => ({ ...current, timeZone: browserTimeZone() }));
      }
      draftReady.current = true;
    }
    setStep("create");
  };

  /** `?going=` from I'm going: the toast once, then the address is clean again. */
  useEffect(() => {
    const url = new URL(window.location.href);
    const going = url.searchParams.get("going")?.trim();
    if (!going) return;
    url.searchParams.delete("going");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void Promise.resolve().then(() => setToast(goingToast(going)));
  }, []);

  useEffect(() => {
    if (step !== "entry") return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/events", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { events?: ListedEvent[] };
        if (!cancelled) setEvents(payload.events ?? []);
      } catch {
        /* keep the list already shown */
      }
    })();
    void (async () => {
      try {
        const response = await fetch("/api/events/invited", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { invited?: InboxInvite[]; declined?: InboxDeclined[] };
        if (cancelled) return;
        setInvited(payload.invited ?? []);
        setDeclined(payload.declined ?? []);
      } catch {
        /* keep the invitations already shown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, reload]);

  const wentGoing = (invite: { token: string; name: string }, next: string | null) => {
    setInviteError(null);
    if (next && !next.startsWith("/network/event")) {
      router.push(next);
      return;
    }
    setInvited((current) => current.filter((entry) => entry.token !== invite.token));
    setDeclined((current) => current.filter((entry) => entry.token !== invite.token));
    setToast(goingToast(invite.name));
    setReload((value) => value + 1);
  };

  const wentNotGoing = (invite: InboxInvite) => {
    setInviteError(null);
    setInvited((current) => current.filter((entry) => entry.token !== invite.token));
    setReload((value) => value + 1);
  };

  const leave = () => {
    setCreateError(null);
    setStep("entry");
  };

  const pastEvents = events.filter((event) => event.status === "past");
  const upcomingEvents = events.filter((event) => event.status !== "past" && event.role === "guest");
  const mineEvents = events.filter((event) => event.status !== "past" && event.role !== "guest");

  const openEvent = (event: ListedEvent) => {
    const token = encodeURIComponent(event.publicToken);
    if (event.role === "owner" || event.role === "manager") {
      router.push(`/e/${token}/manage`);
      return;
    }
    router.push(`/e/${token}/join`);
  };

  const submitEvent = async () => {
    if (!values.name.trim() || savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setCreateError(null);
    try {
      const body = new FormData();
      appendEventFields(body, values, logoFile.current, false);
      const response = await fetch("/api/events", { method: "POST", body });
      const payload = (await response.json()) as { publicToken?: string; error?: string };
      if (!response.ok || !payload.publicToken) {
        setCreateError(payload.error ?? "Could not create the event.");
        savingLock.current = false;
        setSaving(false);
        return;
      }
      draftEcho.current = values;
      clearEventDraft();
      router.replace(`/e/${encodeURIComponent(payload.publicToken)}/manage?created=1`);
    } catch {
      setCreateError("Could not create the event.");
      savingLock.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)] ${
          step === "create" ? "" : "pb-[max(2.5rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <div className={step === "create" ? "flex min-h-full flex-1 flex-col" : undefined}>
          <ScreenHeader
            title={step === "create" ? "Create event" : "Event"}
            fallbackHref="/main"
            onBack={step === "entry" ? () => router.push("/main") : leave}
          />

          {step === "entry" ? (
            <>
              {invited.length > 0 ? (
                <>
                  <InvitedBlock invites={invited} onGoing={wentGoing} onDeclined={wentNotGoing} onError={setInviteError} />
                  <Rule />
                </>
              ) : null}
              {inviteError ? (
                <p className="my-[14px] t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
                  {inviteError}
                </p>
              ) : null}
              <Zone label="Create" rule>
                <ActionLink onClick={openCreate}>Create an event</ActionLink>
                <p className="mt-1 t-meta text-[var(--grey)]">For organisers: invite, check-in, stats.</p>
              </Zone>
              {events.length === 0 && declined.length === 0 ? (
                <p className="py-[18px] t-body text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
                  No events yet.
                </p>
              ) : (
                <>
                  {upcomingEvents.length + declined.length > 0 ? (
                    <EventGroup
                      label="Upcoming"
                      events={upcomingEvents}
                      onOpen={openEvent}
                      after={declined.map((entry) => (
                        <DeclinedRow key={entry.token} entry={entry} onGoing={wentGoing} onError={setInviteError} />
                      ))}
                    />
                  ) : null}
                  {mineEvents.length > 0 ? (
                    <>
                      {upcomingEvents.length + declined.length > 0 ? <Rule /> : null}
                      <EventGroup label="Mine" events={mineEvents} onOpen={openEvent} />
                    </>
                  ) : null}
                  {pastEvents.length > 0 ? (
                    <>
                      {upcomingEvents.length + declined.length + mineEvents.length > 0 ? <Rule /> : null}
                      <EventGroup label="Past" events={pastEvents} muted onOpen={openEvent} />
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <EventForm
              values={values}
              onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
              logoUrl={logo}
              onLogoFile={(file) => {
                logoFile.current = file;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") setLogo(reader.result);
                };
                reader.readAsDataURL(file);
              }}
              onRemoveLogo={() => {
                logoFile.current = null;
                setLogo(null);
              }}
              submitLabel="Create"
              hint="Next: invite guests, add a co-host, set up payment."
              saving={saving}
              error={createError}
              onSubmit={() => void submitEvent()}
            />
          )}
        </div>
      </div>
      <NetworkBand current="event" />
      {toast ? <SkyToast key={toast} text={toast} holdMs={GOING_TOAST_MS} onDone={() => setToast(null)} /> : null}
    </main>
  );
}
