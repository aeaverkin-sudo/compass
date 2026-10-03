"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create" | "join";
type Notice = "qr" | "code" | "link" | "create" | null;

const PLAIN =
  "w-full bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const WHEN =
  "bg-transparent text-[var(--ink)] outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0";
const LINK =
  "text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const SKY_BUTTON =
  "border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

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

function WhenField({
  inputRef,
  type,
  value,
  onChange,
  placeholder,
  width,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  type: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width: string;
}) {
  return (
    <span className="relative inline-flex items-baseline" style={{ width }}>
      {value ? null : (
        <span className="pointer-events-none absolute left-0 text-[var(--placeholder)]" style={fieldStyle()}>
          {placeholder}
        </span>
      )}
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
        className={`relative ${WHEN}`}
        style={{
          ...fieldStyle(),
          width,
          margin: 0,
          padding: 0,
          border: 0,
          appearance: "none",
          WebkitAppearance: "none",
          backgroundColor: "transparent",
          minWidth: 0,
          color: value ? "var(--ink)" : "transparent",
          colorScheme: "light",
        }}
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

function Soon({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="mt-2 t-meta text-[var(--ink)]">Coming soon</p>;
}

/** Event door, join, and create. Nothing is stored yet. */
export function EventEntryScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("entry");
  const [notice, setNotice] = useState<Notice>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [about, setAbout] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const aboutBox = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

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

  const leave = () => {
    setNotice(null);
    setStep("entry");
  };

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[#111]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <ScreenHeader
          title={step === "create" ? "Create event" : step === "join" ? "Join" : "Event"}
          fallbackHref="/main"
          onBack={step === "entry" ? () => router.push("/main") : leave}
        />

        {step === "entry" ? (
          <>
            <Zone label="Join" rule>
              <ActionLink
                onClick={() => {
                  setNotice(null);
                  setStep("join");
                }}
              >
                Join an event
              </ActionLink>
              <p className="mt-1 t-meta text-[var(--grey)]">QR code, short code or invite link.</p>
            </Zone>
            <Zone label="Create" rule>
              <ActionLink
                onClick={() => {
                  setNotice(null);
                  setStep("create");
                }}
              >
                Create an event
              </ActionLink>
              <p className="mt-1 t-meta text-[var(--grey)]">For organisers: invite, check-in, stats.</p>
            </Zone>
            <Zone label="Events">
              <p className="t-body text-[var(--grey)]">No events yet.</p>
            </Zone>
          </>
        ) : null}

        {step === "join" ? (
          <>
            <Zone label="Qr" rule align="start">
              <ActionLink onClick={() => setNotice("qr")}>Scan QR code</ActionLink>
              <p className="mt-1 t-meta text-[var(--grey)]">Point the camera at the event QR.</p>
              <Soon show={notice === "qr"} />
            </Zone>
            <Zone label="Code" rule align="start">
              <div className="flex items-end gap-3">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="WS26"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Event code"
                  className="min-w-0 flex-1 border-b border-[var(--ink)] bg-transparent py-2 text-[var(--ink)] uppercase outline-none placeholder:text-[var(--placeholder)]"
                  style={{ fontSize: 16, fontWeight: 400, letterSpacing: "0.1em", lineHeight: 1.45 }}
                />
                <button
                  type="button"
                  disabled={!code.trim()}
                  onClick={() => setNotice("code")}
                  className={SKY_BUTTON}
                >
                  Join
                </button>
              </div>
              <Soon show={notice === "code"} />
            </Zone>
            <Zone label="Link" align="start">
              <ActionLink onClick={() => setNotice("link")}>Open invite link</ActionLink>
              <p className="mt-1 t-meta text-[var(--grey)]">Paste a link from an organiser.</p>
              <Soon show={notice === "link"} />
            </Zone>
          </>
        ) : null}

        {step === "create" ? (
          <>
            <Zone label="Name" rule onClick={(event) => focusField(event, nameRef.current)}>
              <PlainField inputRef={nameRef} value={name} onChange={setName} placeholder="Event name" />
            </Zone>
            <Zone label="When" rule onClick={(event) => focusField(event, dateRef.current)}>
              <div className="flex items-baseline gap-[18px]">
                <WhenField
                  inputRef={dateRef}
                  type="date"
                  value={date}
                  onChange={setDate}
                  placeholder="Date"
                  width="calc(9ch + 6px)"
                />
                <span aria-hidden className="text-[var(--grey)]" style={fieldStyle()}>
                  ·
                </span>
                <WhenField
                  inputRef={timeRef}
                  type="time"
                  value={time}
                  onChange={setTime}
                  placeholder="Time"
                  width="5ch"
                />
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
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") setLogo(reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />
            <Zone
              label="Logo"
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
            <Zone label="About" onClick={(event) => focusField(event, aboutRef.current)}>
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
            <div className="pb-4" style={{ marginLeft: VALUE_AXIS_PX }}>
              <button
                type="button"
                disabled={!name.trim()}
                onClick={() => setNotice("create")}
                className={SKY_BUTTON}
              >
                Create
              </button>
              <p className="mt-3 t-meta text-[var(--grey)]">
                You'll get a QR code, a link and a short code to invite guests.
              </p>
              <Soon show={notice === "create"} />
            </div>
          </>
        ) : null}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}
