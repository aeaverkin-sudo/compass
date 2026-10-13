"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Zone } from "@/shared/components/zone";
import { scanKeyFromQr, scanKeyId, type ScanKey } from "@/shared/event/scan-key";
import { CheckMark } from "../check-mark";
import { ManageFrame } from "../manage-frame";

type ScanResult =
  | { status: "ok"; name: string; at: string }
  | { status: "already"; name: string; at: string }
  | { status: "pending"; name: string; payCode: string | null; key: ScanKey }
  | { status: "missing"; text: string };

type LastArrival = { name: string; at: string; byViewer: boolean };

type CheckinScreenProps = {
  lookup: string;
  name: string;
  registered: number;
  checkedIn: number;
  last: LastArrival | null;
  roster: { name: string; regToken: string }[];
  /** The event's zone: arrival times read on the event's clock. */
  timeZone: string;
};

function clock(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
}

function scanBody(key: ScanKey) {
  if (key.kind === "badge") return { regToken: key.token };
  if (key.kind === "card") return { cardToken: key.token };
  return { handle: key.handle };
}

function Corner({ x, y }: { x: "left" | "right"; y: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 h-5 w-5"
      style={{
        [x]: 12,
        [y]: 12,
        borderTop: y === "top" ? "2px solid var(--sky)" : undefined,
        borderBottom: y === "bottom" ? "2px solid var(--sky)" : undefined,
        borderLeft: x === "left" ? "2px solid var(--sky)" : undefined,
        borderRight: x === "right" ? "2px solid var(--sky)" : undefined,
      }}
    />
  );
}

export function CheckinScreen({ lookup, name, registered, checkedIn, last, roster, timeZone }: CheckinScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const busyRef = useRef(false);
  const seenRef = useRef<{ token: string; at: number } | null>(null);
  const [count, setCount] = useState(checkedIn);
  const [latest, setLatest] = useState(last);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [query, setQuery] = useState("");

  const submit = async (key: ScanKey, confirm = false) => {
    if (busyRef.current) return;
    if (!confirm) {
      const id = scanKeyId(key);
      const seen = seenRef.current;
      if (seen && seen.token === id && Date.now() - seen.at < 3000) return;
      seenRef.current = { token: id, at: Date.now() };
    }
    busyRef.current = true;
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scanBody(key), confirm }),
      });
      const body = (await response.json()) as {
        status?: string;
        name?: string;
        at?: string;
        payCode?: string | null;
        error?: string;
      };
      if (body.status === "ok" && body.name && body.at) {
        setResult({ status: "ok", name: body.name, at: body.at });
        setCount((value) => value + 1);
        setLatest({ name: body.name, at: body.at, byViewer: true });
        return;
      }
      if (body.status === "already" && body.name && body.at) {
        setResult({ status: "already", name: body.name, at: body.at });
        return;
      }
      if (body.status === "pending" && body.name) {
        setResult({ status: "pending", name: body.name, payCode: body.payCode ?? null, key });
        return;
      }
      if (response.status === 404) {
        setResult({ status: "missing", text: key.kind === "badge" ? "Event badge not found" : (body.error ?? "Not on the list for this event") });
      }
    } catch {
      seenRef.current = null;
    } finally {
      busyRef.current = false;
    }
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const read = () => {
      if (stopped) return;
      timer = window.setTimeout(read, 250);
      if (!context || video.readyState < 2 || !video.videoWidth) return;
      const width = Math.min(video.videoWidth, 480);
      const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const code = jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" });
      const key = code?.data ? scanKeyFromQr(code.data) : null;
      if (key) void submitRef.current(key);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        read();
      } catch {
        // No camera. Find still checks a guest in by name.
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle ? roster.filter((guest) => guest.name.toLowerCase().includes(needle)).slice(0, 8) : [];

  return (
    <ManageFrame title="Check-in" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`}>
      <div className="mx-auto w-full max-w-[280px]">
        <div className="relative aspect-square overflow-hidden bg-[var(--ink)]" aria-label="Badge scanner">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
          <Corner x="left" y="top" />
          <Corner x="right" y="top" />
          <Corner x="left" y="bottom" />
          <Corner x="right" y="bottom" />
        </div>
        <p className="mt-3 mb-0 text-center t-meta text-[var(--grey)]">Point at the guest&apos;s badge QR</p>
      </div>
      {result?.status === "ok" ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <CheckMark large />
          <p className="mb-0 t-body text-[var(--ink)]">{result.name}</p>
          <p className="mb-0 t-meta text-[var(--grey)]">{clock(result.at, timeZone)}</p>
        </div>
      ) : null}
      {result?.status === "already" ? (
        <p className="mt-6 mb-0 text-center t-body text-[var(--ink)]">{`Already checked in · ${clock(result.at, timeZone)}`}</p>
      ) : null}
      {result?.status === "pending" ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <p className="mb-0 t-body text-[var(--ink)]">{result.name}</p>
          <p className="mt-2 mb-0 inline-flex items-center gap-2 t-caps text-[var(--ink)]">
            <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: "var(--pay-pending)" }} />
            Not confirmed
          </p>
          <p className="mt-2 mb-0 t-meta text-[var(--grey)]">
            {result.payCode ? `Code ${result.payCode} · no matching payment` : "No matching payment"}
          </p>
          <button
            type="button"
            onClick={() => void submit(result.key, true)}
            className="press mt-4 border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            Confirm & let in
          </button>
          <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Not checked in yet.</p>
        </div>
      ) : null}
      {result?.status === "missing" ? (
        <p className="mt-6 mb-0 text-center t-meta text-[var(--grey)]">{result.text}</p>
      ) : null}
      <p className="mt-6 mb-0 text-center t-body text-[var(--ink)]">{`${name} · ${count} of ${registered} checked in`}</p>
      <Zone label="Last" rule>
        {latest ? (
          <>
            <p className="mb-0 t-body text-[var(--ink)]">{latest.name}</p>
            <p className="mt-1 mb-0 t-meta text-[var(--grey)]">
              {`Checked in · ${clock(latest.at, timeZone)}${latest.byViewer ? " · by you" : ""}`}
            </p>
          </>
        ) : (
          <p className="mb-0 t-meta text-[var(--grey)]">No one yet</p>
        )}
      </Zone>
      <Zone label="Find">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name"
          aria-label="Find a guest"
          className="w-full bg-transparent t-body text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
        />
        {matches.length > 0 ? (
          <ul className="mt-3">
            {matches.map((guest) => (
              <li key={guest.regToken}>
                <button
                  type="button"
                  onClick={() => void submit({ kind: "badge", token: guest.regToken })}
                  className="press block w-full py-2 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
                >
                  {guest.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Zone>
    </ManageFrame>
  );
}
