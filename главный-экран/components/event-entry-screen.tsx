"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { EventForm } from "@/shared/event/event-form";
import { appendEventFields, type EventFormValues } from "@/shared/event/event-form-fields";
import { isEventLayout, isEventTheme } from "@/shared/event/themes";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create";

type ListedEvent = {
  name: string;
  publicToken: string;
  when: string | null;
  role: "owner" | "manager" | "guest";
};

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
  layout: "grid",
  themeTouched: false,
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
    a.themeTouched === b.themeTouched
  );
}

function roleLine(event: ListedEvent): string {
  const role = event.role === "owner" ? "Owner" : event.role === "manager" ? "Manager" : "Guest";
  return `${role} · ${event.when ?? "No date"}`;
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
  /** Restored fields. Don't write them back and refresh the hour. */
  const draftEcho = useRef<EventFormValues | null>(null);

  useEffect(() => {
    if (!draftReady.current || step !== "create") return;
    if (draftEcho.current && sameDraft(draftEcho.current, values)) return;
    draftEcho.current = null;
    writeEventDraft(values);
  }, [step, values]);

  useEffect(() => {
    const draft = readEventDraft();
    if (draft) {
      const { savedAt: _savedAt, ...fields } = draft;
      setValues(fields);
      draftEcho.current = fields;
    } else {
      clearEventDraft();
    }
    draftReady.current = true;
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
    setStep("entry");
  };

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
              <Zone label="Create" rule>
                <ActionLink onClick={() => setStep("create")}>Create an event</ActionLink>
                <p className="mt-1 t-meta text-[var(--grey)]">For organisers: invite, check-in, stats.</p>
              </Zone>
              {events.length === 0 ? (
                <p className="py-[18px] t-body text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
                  No events yet.
                </p>
              ) : (
                <section>
                  <div
                    className="grid items-start"
                    style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
                  >
                    <span className="t-label pt-[14px]">Events</span>
                    <ul>
                      {events.map((event) => (
                        <li key={event.publicToken}>
                          <button
                            type="button"
                            onClick={() => openEvent(event)}
                            className="press block w-full py-[14px] text-left [-webkit-tap-highlight-color:transparent]"
                          >
                            <span className="block t-body text-[var(--ink)]">{event.name}</span>
                            <span className="mt-1 block t-meta text-[var(--grey)]">{roleLine(event)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
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
