"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
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
  startsAt: string | null;
  place?: string | null;
  pass?: { cardName: string; photoUrl: string | null } | null;
};

const LINK = "press text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

const DRAFT_KEY = "aded:event-draft";
/** The form was open when the screen was left: coming back opens it again. */
const DRAFT_OPEN_KEY = "aded:event-draft-open";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** A bigger picture is not kept: the browser store holds a few megabytes for the whole site. */
const DRAFT_LOGO_MAX = 2_000_000;

type DraftLogo = { dataUrl: string; name: string };
type EventDraft = EventFormValues & { savedAt: number; logo?: DraftLogo | null };

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
      logo:
        data.logo && isDraftString(data.logo.dataUrl) && data.logo.dataUrl.startsWith("data:image/") && isDraftString(data.logo.name)
          ? data.logo
          : null,
    };
  } catch {
    return null;
  }
}

function writeEventDraft(fields: EventFormValues, logo: DraftLogo | null) {
  const kept = logo && logo.dataUrl.length <= DRAFT_LOGO_MAX ? logo : null;
  try {
    const draft: EventDraft = { ...fields, savedAt: Date.now(), logo: kept };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...fields, savedAt: Date.now(), logo: null }));
    } catch {
      /* private mode or a blocked store: the form still works */
    }
  }
}

function clearEventDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_OPEN_KEY);
  } catch {
    /* private mode or a blocked store */
  }
}

function markDraftOpen(open: boolean) {
  try {
    if (open) localStorage.setItem(DRAFT_OPEN_KEY, "1");
    else localStorage.removeItem(DRAFT_OPEN_KEY);
  } catch {
    /* private mode or a blocked store */
  }
}

function draftWasOpen(): boolean {
  try {
    return localStorage.getItem(DRAFT_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

async function fileFromDataUrl(logo: DraftLogo): Promise<File | null> {
  try {
    const blob = await (await fetch(logo.dataUrl)).blob();
    return new File([blob], logo.name, { type: blob.type });
  } catch {
    return null;
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

function EventRow({ event, muted = false, onOpen }: { event: ListedEvent; muted?: boolean; onOpen: (event: ListedEvent) => void }) {
  return (
    <li>
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
  );
}

function EventGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
      >
        <span className="t-label pt-[14px]">{label}</span>
        <ul>{children}</ul>
      </div>
    </section>
  );
}

/** Soonest first; no date at the end. */
function byStart(left: { startsAt: string | null }, right: { startsAt: string | null }): number {
  const at = (value: string | null) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER);
  return at(left.startsAt) - at(right.startsAt);
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
  const logoFile = useRef<File | null>(null);
  const savingLock = useRef(false);
  const draftReady = useRef(false);
  /** Restored fields. Don't write them back and refresh the clock. */
  const draftEcho = useRef<{ values: EventFormValues; logo: string | null } | null>(null);
  const logoShown = useRef<string | null>(null);

  useEffect(() => {
    logoShown.current = logo;
    if (!draftReady.current || step !== "create") return;
    if (draftEcho.current && sameDraft(draftEcho.current.values, values) && draftEcho.current.logo === logo) return;
    draftEcho.current = null;
    writeEventDraft(values, logo ? { dataUrl: logo, name: logoFile.current?.name || "logo" } : null);
  }, [step, values, logo]);

  /** The draft comes back the first time the form opens. */
  const openCreate = () => {
    if (!draftReady.current) {
      const draft = readEventDraft();
      if (draft) {
        const { savedAt, logo: savedLogo, ...fields } = draft;
        void savedAt;
        setValues(fields);
        if (savedLogo) {
          setLogo(savedLogo.dataUrl);
          void fileFromDataUrl(savedLogo).then((file) => {
            if (file && !logoFile.current && logoShown.current === savedLogo.dataUrl) logoFile.current = file;
          });
        }
        draftEcho.current = { values: fields, logo: savedLogo?.dataUrl ?? null };
      } else {
        clearEventDraft();
        setValues((current) => ({ ...current, timeZone: browserTimeZone() }));
      }
      draftReady.current = true;
    }
    markDraftOpen(true);
    setStep("create");
  };

  // Left for the card, Network or another app with the form open: it opens again with what was typed.
  useEffect(() => {
    if (!draftWasOpen() || !readEventDraft()) return;
    const frame = requestAnimationFrame(openCreate);
    return () => cancelAnimationFrame(frame);
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
    return () => {
      cancelled = true;
    };
  }, [step]);

  const leave = () => {
    setCreateError(null);
    markDraftOpen(false);
    setStep("entry");
  };

  const pastEvents = events.filter((event) => event.status === "past");
  const upcoming = events.filter((event) => event.status !== "past").sort(byStart);

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
      draftEcho.current = { values, logo };
      clearEventDraft();
      router.replace(`/e/${encodeURIComponent(payload.publicToken)}/manage?created=1`);
    } catch {
      setCreateError("Could not create the event.");
      savingLock.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="compass-main relative flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div
        className="compass-under-band flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)]"
      >
        <div className={step === "create" ? "flex min-h-full flex-1 flex-col" : undefined}>
          <ScreenHeader
            title={step === "create" ? "Create event" : "Event"}
            fallbackHref="/main"
            onBack={step === "entry" ? () => router.push("/main") : leave}
          />

          {step === "entry" ? (
            <>
              <Zone label="Create" rule>
                <ActionLink onClick={openCreate}>Create an event</ActionLink>
                <p className="mt-1 t-meta text-[var(--grey)]">For organisers: invite, check-in, stats.</p>
              </Zone>
              {upcoming.length === 0 && pastEvents.length === 0 ? (
                <p className="py-[18px] t-body text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
                  No events yet.
                </p>
              ) : (
                <>
                  {upcoming.length > 0 ? (
                    <EventGroup label="Upcoming">
                      {upcoming.map((event) => (
                        <EventRow key={event.publicToken} event={event} onOpen={openEvent} />
                      ))}
                    </EventGroup>
                  ) : null}
                  {pastEvents.length > 0 ? (
                    <>
                      {upcoming.length > 0 ? <Rule /> : null}
                      <EventGroup label="Past">
                        {pastEvents.map((event) => (
                          <EventRow key={event.publicToken} event={event} muted onOpen={openEvent} />
                        ))}
                      </EventGroup>
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
    </main>
  );
}
