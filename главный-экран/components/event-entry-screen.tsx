"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { NetworkBand } from "@/app/network/network-band";

type Step = "entry" | "create" | "join";
type Notice = "qr" | "code" | "link" | "create" | null;

const FIELD =
  "w-full border-b border-[var(--rule)] bg-transparent py-2 text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const LINK =
  "text-left t-body text-[var(--ink)] underline decoration-[0.5px] underline-offset-[3px] [-webkit-tap-highlight-color:transparent]";
const SKY_BUTTON =
  "border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function fieldStyle() {
  return { fontSize: 16, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.45 } as const;
}

function LineField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={FIELD}
      style={fieldStyle()}
    />
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
            <Zone label="Name" rule align="start">
              <LineField value={name} onChange={setName} placeholder="Event name" />
            </Zone>
            <Zone label="Date" rule align="start">
              <LineField value={date} onChange={setDate} placeholder="Date" />
              <div className="mt-3">
                <LineField value={time} onChange={setTime} placeholder="Time" />
              </div>
            </Zone>
            <Zone label="Place" rule align="start">
              <LineField value={place} onChange={setPlace} placeholder="Venue, address" />
            </Zone>
            <Zone label="Logo" rule align="start">
              <div className="flex size-16 items-center justify-center border border-[var(--rule)]">
                <Plus className="size-5 text-[#111]" strokeWidth={1} aria-hidden />
              </div>
              <p className="mt-2 t-meta text-[var(--grey)]">Square, PNG or SVG.</p>
            </Zone>
            <Zone label="About" align="start">
              <LineField value={about} onChange={setAbout} placeholder="One or two lines" />
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
