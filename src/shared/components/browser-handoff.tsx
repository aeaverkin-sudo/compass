"use client";

import { useState, useSyncExternalStore } from "react";
import { BAND_DROP_PX } from "@main/layout";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { isHomeScreenApp } from "@/shared/services/save-public-card-pdf";

function subscribe() {
  return () => {};
}

/** In-app webviews only. Safari, Chrome, and the installed app have no button. */
function embeddedBrowser() {
  if (isHomeScreenApp()) return false;
  const ua = navigator.userAgent;
  if (/Telegram|GSA|Gmail|Outlook|FBAN|FBAV|Instagram/i.test(ua)) return true;
  return /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);
}

type Line = { kind: "ready" } | { kind: "copied" } | { kind: "error" } | { kind: "hold"; url: string };

const plate = {
  left: `calc(var(--gutter) + ${VALUE_AXIS_PX}px)`,
  right: "var(--gutter)",
  bottom: `calc(48px + max(0px, env(safe-area-inset-bottom) - ${BAND_DROP_PX}px) + 14px)`,
  padding: "13px 16px 14px",
};

/** Signed-in in-app browsers only. The letter link is a different token and stays valid. */
export function BrowserHandoff({ paused, registered }: { paused: boolean; registered: boolean }) {
  const show = useSyncExternalStore(subscribe, embeddedBrowser, () => false);
  const [line, setLine] = useState<Line>({ kind: "ready" });
  const [busy, setBusy] = useState(false);

  if (!show || paused || !registered) return null;

  const copy = () => {
    if (busy) return;
    setBusy(true);
    const urlPromise = fetch("/api/account/browser-link", { method: "POST" }).then(async (response) => {
      const body = (await response.json().catch(() => ({}))) as { url?: string };
      if (!response.ok || !body.url) throw new Error("no url");
      return body.url;
    });
    const plain = urlPromise.then((url) => new Blob([url], { type: "text/plain" }));
    // Safari allows a clipboard write only in the tap. The URL arrives later, as a promise.
    let write: Promise<void>;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        write = navigator.clipboard.write([new ClipboardItem({ "text/plain": plain })]);
      } catch {
        write = urlPromise.then((url) => navigator.clipboard.writeText(url));
      }
    } else {
      write = urlPromise.then((url) => navigator.clipboard.writeText(url));
    }
    write
      .then(() => setLine({ kind: "copied" }))
      .catch(async () => {
        try {
          setLine({ kind: "hold", url: await urlPromise });
        } catch {
          setLine({ kind: "error" });
        }
      })
      .finally(() => setBusy(false));
  };

  const second =
    line.kind === "copied"
      ? "Link copied — paste it in Safari or Chrome."
      : line.kind === "error"
        ? "Could not copy. Try again."
        : line.kind === "hold"
          ? "Hold to copy:"
          : "Copy link";
  const lines = (
    <>
      <span className="block t-caps">Open in your browser</span>
      <span className={`mt-[6px] block ${line.kind === "hold" || line.kind === "ready" ? "t-body" : "t-meta"} ${line.kind === "ready" ? "underline" : ""}`}>
        {second}
      </span>
    </>
  );

  if (line.kind === "hold") {
    return (
      <div data-no-swipe className="fixed z-40 bg-sky text-left text-[var(--ink)]" style={plate}>
        <button
          type="button"
          onClick={() => void copy()}
          className="block w-full border-0 bg-transparent p-0 text-left text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
        >
          {lines}
        </button>
        <p className="m-0 mt-[6px] break-all t-meta select-text">{line.url}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-no-swipe
      onClick={() => void copy()}
      className="fixed z-40 border-0 bg-sky text-left text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
      style={plate}
    >
      {lines}
    </button>
  );
}
