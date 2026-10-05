"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Plus, Share } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SkyToast } from "@/shared/components/sky-toast";
import { Zone } from "@/shared/components/zone";
import { readPaymentUrl } from "@/shared/event/payment";
import { shareInviteLink } from "@/shared/event/share-invite";
import { InviteCover } from "@/shared/event/invite-cover";
import {
  EVENT_LAYOUTS,
  EVENT_THEMES,
  isEventLayout,
  isEventTheme,
  layoutDefaultTheme,
  type EventLayoutId,
  type EventThemeId,
} from "@/shared/event/themes";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX, VALUE_AXIS_PX } from "@/shared/layout/axes";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create";

type CreatedEvent = {
  publicToken: string;
  invitePath: string;
};

type ListedEvent = {
  name: string;
  publicToken: string;
  when: string | null;
  role: "owner" | "guest";
};

function ShareInvite({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Share" className="text-[var(--ink)] outline-none">
      <Share className="size-4" strokeWidth={1.25} aria-hidden />
    </button>
  );
}

const PLAIN =
  "w-full bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const LINK =
  "press text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";

const DRAFT_KEY = "aded:event-draft";
const DRAFT_TTL_MS = 60 * 60 * 1000;

type EventDraftFields = {
  name: string;
  date: string;
  time: string;
  endTime: string;
  place: string;
  about: string;
  paymentUrl: string;
  theme: EventThemeId;
  layout: EventLayoutId;
  themeTouched: boolean;
};

type EventDraft = EventDraftFields & { savedAt: number };

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
      !isDraftString(data.paymentUrl) ||
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
      paymentUrl: data.paymentUrl,
      theme,
      layout,
      themeTouched: data.themeTouched,
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}

function writeEventDraft(fields: EventDraftFields) {
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

function sameDraft(a: EventDraftFields, b: EventDraftFields) {
  return (
    a.name === b.name &&
    a.date === b.date &&
    a.time === b.time &&
    a.endTime === b.endTime &&
    a.place === b.place &&
    a.about === b.about &&
    a.paymentUrl === b.paymentUrl &&
    a.theme === b.theme &&
    a.layout === b.layout &&
    a.themeTouched === b.themeTouched
  );
}
const SKY_BUTTON =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function fieldStyle() {
  return {
    fontSize: 16,
    fontWeight: 400,
    letterSpacing: "-0.015em",
    lineHeight: 1.45,
    caretColor: "var(--ink)",
    fontFamily: "inherit",
  } as const;
}

function focusField(event: MouseEvent<HTMLElement>, node: HTMLElement | null) {
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea")) return;
  node?.focus();
}

function PlainField({
  inputRef,
  value,
  onChange,
  placeholder,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={PLAIN}
      style={fieldStyle()}
    />
  );
}

function WhenField({ inputRef, type, value, display, onChange, placeholder, width }: {
  inputRef: RefObject<HTMLInputElement | null>;
  type: "date" | "time";
  value: string;
  display: string;
  onChange: (value: string) => void;
  placeholder: string;
  width: string;
}) {
  return (
    <span className="relative inline-flex items-baseline" style={{ width }}>
      <span
        className="pointer-events-none whitespace-nowrap"
        style={{ ...fieldStyle(), color: value ? "var(--ink)" : "var(--placeholder)" }}
      >
        {value ? display : placeholder}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
        className="absolute inset-0 opacity-0"
        style={{ width, appearance: "none", WebkitAppearance: "none" }}
      />
    </span>
  );
}

function ActionLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={LINK}>
      {children}
    </button>
  );
}

function CreatedInvite({
  event,
  title,
  onShare,
}: {
  event: CreatedEvent;
  title: string;
  onShare: (title: string, url: string) => void;
}) {
  const url = `${window.location.origin}${event.invitePath}`;
  return (
    <>
      <Zone label="Link" rule>
        <p className="t-body break-all text-[var(--ink)]" style={{ userSelect: "text", WebkitUserSelect: "text" }}>
          {url}
        </p>
        <div className="mt-3">
          <ShareInvite onClick={() => onShare(title, url)} />
        </div>
      </Zone>
    </>
  );
}

function fmtDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function previewDate(date: string, time: string): string | null {
  if (!date) return null;
  const when = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

function previewEnd(date: string, endTime: string): string | null {
  if (!date || !endTime) return null;
  const end = new Date(`${date}T${endTime}`);
  return Number.isNaN(end.getTime()) ? null : end.toISOString();
}

/** Event door and create. */
export function EventEntryScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("entry");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [place, setPlace] = useState("");
  const [about, setAbout] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [theme, setTheme] = useState<EventThemeId>("paper");
  const [layout, setLayout] = useState<EventLayoutId>("grid");
  const [themeTouched, setThemeTouched] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedEvent | null>(null);
  const [events, setEvents] = useState<ListedEvent[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const logoFile = useRef<File | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const paymentRef = useRef<HTMLInputElement>(null);
  const aboutBox = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const draftReady = useRef(false);
  /** Restored or just-created fields. Don't write them back and refresh the hour. */
  const draftEcho = useRef<EventDraftFields | null>(null);

  const draftFields = (): EventDraftFields => ({
    name,
    date,
    time,
    endTime,
    place,
    about,
    paymentUrl,
    theme,
    layout,
    themeTouched,
  });

  const sizeAbout = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
    const box = aboutBox.current;
    if (!box) return;
    const line = parseFloat(getComputedStyle(node).lineHeight) || 23;
    box.style.marginBottom = `${Math.max(0, node.scrollHeight - line)}px`;
  };

  useEffect(() => {
    if (step === "create" && aboutRef.current) sizeAbout(aboutRef.current);
  }, [step, about]);

  useEffect(() => {
    if (!draftReady.current || step !== "create") return;
    const fields = draftFields();
    if (draftEcho.current && sameDraft(draftEcho.current, fields)) return;
    draftEcho.current = null;
    writeEventDraft(fields);
  }, [step, name, date, time, endTime, place, about, paymentUrl, theme, layout, themeTouched]);

  useEffect(() => {
    const draft = readEventDraft();
    if (draft) {
      setName(draft.name);
      setDate(draft.date);
      setTime(draft.time);
      setEndTime(draft.endTime);
      setPlace(draft.place);
      setAbout(draft.about);
      setPaymentUrl(draft.paymentUrl);
      setTheme(draft.theme);
      setLayout(draft.layout);
      setThemeTouched(draft.themeTouched);
      draftEcho.current = draft;
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
    setCreated(null);
    setStep("entry");
  };

  const openEvent = (event: ListedEvent) => {
    const token = encodeURIComponent(event.publicToken);
    if (event.role === "owner") {
      router.push(`/e/${token}/manage`);
      return;
    }
    router.push(`/e/${token}/join`);
  };

  const share = (title: string, url: string) => {
    const canShare = typeof navigator.share === "function" ? (data: { title: string; url: string }) => navigator.share(data) : undefined;
    void shareInviteLink(
      { title, url },
      {
        share: canShare,
        writeText: async (value) => {
          if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
          await navigator.clipboard.writeText(value);
        },
      },
    ).then((outcome) => {
      if (outcome === "copied") setNotice("Link copied");
    });
  };

  const submitEvent = async () => {
    if (!name.trim() || saving) return;
    const link = readPaymentUrl(paymentUrl);
    if (paymentUrl.trim() && !link) {
      setCreateError("That payment link is not a URL.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const body = new FormData();
      body.set("name", name.trim());
      body.set("description", about.trim());
      body.set("place", place.trim());
      body.set("theme", theme);
      body.set("layout", layout);
      if (link) {
        body.set("is_paid", "1");
        body.set("payment_url", link);
      }
      if (date) {
        const when = new Date(`${date}T${time || "00:00"}`);
        if (!Number.isNaN(when.getTime())) body.set("date", when.toISOString());
      }
      if (date && endTime) {
        const end = new Date(`${date}T${endTime}`);
        if (!Number.isNaN(end.getTime())) body.set("end", end.toISOString());
      }
      if (logoFile.current) body.set("logo", logoFile.current);
      const response = await fetch("/api/events", { method: "POST", body });
      const payload = (await response.json()) as CreatedEvent & { error?: string };
      if (!response.ok) {
        setCreateError(payload.error ?? "Could not create the event.");
        return;
      }
      draftEcho.current = draftFields();
      clearEventDraft();
      setCreated(payload);
    } catch {
      setCreateError("Could not create the event.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)] ${
          step === "create" && !created ? "" : "pb-[max(2.5rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <div className={step === "create" && !created ? "flex min-h-full flex-1 flex-col" : undefined}>
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
                          <span className="mt-1 block t-meta text-[var(--grey)]">
                            {`${event.role === "owner" ? "Owner" : "Guest"}${event.when ? ` · ${event.when}` : " · Draft"}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </>
        ) : null}

        {step === "create" && created ? (
          <CreatedInvite event={created} title={name.trim() || "Event"} onShare={share} />
        ) : null}

        {step === "create" && !created ? (
          <>
            <Zone label="Name" rule onClick={(event) => focusField(event, nameRef.current)}>
              <PlainField inputRef={nameRef} value={name} onChange={setName} placeholder="Event name" />
            </Zone>
            <Zone label="When" rule onClick={(event) => focusField(event, dateRef.current)}>
              <div className="flex items-baseline">
                <WhenField
                  inputRef={dateRef}
                  type="date"
                  value={date}
                  display={fmtDate(date)}
                  onChange={setDate}
                  placeholder="Date"
                  width="8ch"
                />
                <div className="ml-6 flex items-baseline">
                  <WhenField
                    inputRef={timeRef}
                    type="time"
                    value={time}
                    display={time}
                    onChange={setTime}
                    placeholder="Start"
                    width="5ch"
                  />
                  <span aria-hidden className="mx-2 text-[var(--grey)]" style={fieldStyle()}>
                    –
                  </span>
                  <WhenField
                    inputRef={endRef}
                    type="time"
                    value={endTime}
                    display={endTime}
                    onChange={setEndTime}
                    placeholder="End"
                    width="5ch"
                  />
                </div>
              </div>
            </Zone>
            <Zone label="Place" rule onClick={(event) => focusField(event, placeRef.current)}>
              <PlainField inputRef={placeRef} value={place} onChange={setPlace} placeholder="Venue, address" />
            </Zone>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/svg+xml,.png,.svg"
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
              onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  logoFile.current = file;
                  const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") setLogo(reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />
            <Zone
              label="Pic"
              align="center"
              rule
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("input")) return;
                logoRef.current?.click();
              }}
            >
              <div className="flex items-center gap-[14px]">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="size-12 object-contain" />
                ) : (
                  <Plus className="size-7 shrink-0 text-hint" strokeWidth={1.5} aria-hidden />
                )}
                <p className="t-meta text-[var(--grey)]">{logo ? "Tap to replace." : "Square, PNG or SVG."}</p>
              </div>
            </Zone>
            <Zone label="About" rule onClick={(event) => focusField(event, aboutRef.current)}>
              <div ref={aboutBox} className="relative">
                <span aria-hidden className="invisible block" style={fieldStyle()}>
                  {"\u00a0"}
                </span>
                <textarea
                  ref={aboutRef}
                  rows={1}
                  value={about}
                  aria-label="About"
                  className={`${PLAIN} absolute inset-x-0 top-0 resize-none overflow-hidden`}
                  style={fieldStyle()}
                  onChange={(event) => {
                    setAbout(event.target.value);
                    sizeAbout(event.target);
                  }}
                />
              </div>
            </Zone>
            <Zone
              label={<span className="t-label whitespace-normal">Payment link</span>}
              align="start"
              rule
              onClick={(event) => focusField(event, paymentRef.current)}
            >
              <input
                ref={paymentRef}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={paymentUrl}
                aria-label="Payment link"
                placeholder="https://"
                onChange={(event) => setPaymentUrl(event.target.value)}
                className={PLAIN}
                style={fieldStyle()}
              />
              <p className="mt-2 t-meta text-[var(--grey)]">
                If guests pay to attend, paste your payment link (Stripe, PayPal, Revolut…) — they'll pay through it. No link means a free event.
              </p>
            </Zone>
            <Zone label="Style" rule>
              <div className="flex flex-wrap gap-4">
                {EVENT_LAYOUTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={layout === item.id}
                    onClick={() => {
                      setLayout(item.id);
                      if (!themeTouched) setTheme(layoutDefaultTheme(item.id));
                    }}
                    className="press border-0 bg-transparent p-0 t-caps [-webkit-tap-highlight-color:transparent]"
                    style={{ color: layout === item.id ? "var(--ink)" : "var(--grey)" }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </Zone>
            <Zone label={<span className="t-label block whitespace-nowrap pt-[5px]">Color</span>} align="start">
              {/* One row on every phone: six equal cells, the square fills its cell up to 28px. */}
              <div className="grid grid-cols-6 items-start gap-2" style={{ maxWidth: 6 * 28 + 5 * 8 }}>
                {EVENT_THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={theme === item.id}
                    onClick={() => {
                      setThemeTouched(true);
                      setTheme(item.id);
                    }}
                    className="press block w-full border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
                  >
                    <span
                      className="block aspect-square w-full"
                      style={{
                        background: `var(--event-theme-${item.id})`,
                        boxShadow: item.id === "paper" ? "inset 0 0 0 1px #999" : undefined,
                      }}
                    />
                    <span
                      className="mt-1 block h-px"
                      style={{ background: theme === item.id ? "var(--ink)" : "transparent" }}
                    />
                  </button>
                ))}
              </div>
            </Zone>
            <div className="pb-4" style={{ marginLeft: VALUE_AXIS_PX }}>
              <button
                type="button"
                disabled={!name.trim() || saving}
                onClick={() => void submitEvent()}
                className={SKY_BUTTON}
              >
                Create
              </button>
              <p className="mt-3 t-meta text-[var(--grey)]">
                You'll get a link to invite guests, or a PDF with an I'm going button.
              </p>
              {createError ? <p className="mt-2 t-meta text-[var(--ink)]">{createError}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="press mt-8 block border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
              style={{ marginLeft: VALUE_AXIS_PX, width: 150, paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
            >
              <InviteCover
                variant="card"
                layout={layout}
                themeId={theme}
                event={{
                  name: name.trim() || "Event name",
                  description: about.trim() || null,
                  date: previewDate(date, time),
                  endDate: previewEnd(date, endTime),
                  place: place.trim() || null,
                  placeSecret: false,
                  logoUrl: logo,
                }}
              />
            </button>
          </>
        ) : null}
        </div>
      </div>
      {previewOpen ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close preview"
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") setPreviewOpen(false);
          }}
          className="fixed inset-0 z-[80] overflow-y-auto [-webkit-tap-highlight-color:transparent]"
          style={{ background: `var(--event-theme-${theme})`, color: `var(--event-theme-${theme}-ink)` }}
        >
          <InviteCover
            variant="page"
            layout={layout}
            themeId={theme}
            event={{
              name: name.trim() || "Event name",
              description: about.trim() || null,
              date: previewDate(date, time),
              endDate: previewEnd(date, endTime),
              place: place.trim() || null,
              placeSecret: false,
              logoUrl: logo,
            }}
          />
        </div>
      ) : null}
      <NetworkBand current="event" />
    </main>
  );
}
