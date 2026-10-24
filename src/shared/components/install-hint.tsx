"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { BAND_DROP_PX } from "@main/layout";
import { isHomeScreenApp } from "@/shared/services/save-public-card-pdf";

const SEEN_KEY = "aded:install-hint";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((listener) => listener());
  });
}

function seen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: shown again next visit */
  }
}

function iosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS|Telegram|FBAN|FBAV|Instagram/.test(ua);
}

type Mode = "ios" | "prompt" | null;

function currentMode(): Mode {
  if (isHomeScreenApp() || seen()) return null;
  if (deferred) return "prompt";
  return iosSafari() ? "ios" : null;
}

/** Once, in the browser only: how to keep ADED on the home screen. The installed app never shows it. */
export function InstallHint({ paused }: { paused: boolean }) {
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    const sync = () => setMode(currentMode());
    const frame = window.requestAnimationFrame(sync);
    listeners.add(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      listeners.delete(sync);
    };
  }, []);

  if (!mode || paused) return null;

  const close = () => {
    markSeen();
    setMode(null);
  };

  const install = async () => {
    const event = deferred;
    if (!event) return close();
    deferred = null;
    await event.prompt();
    close();
  };

  return (
    <div
      data-no-swipe
      className="fixed left-1/2 z-40 flex w-max max-w-[min(100%-48px,300px)] -translate-x-1/2 items-start gap-2 bg-sky py-2.5 pr-2 pl-3 t-meta text-[var(--ink)]"
      style={{ bottom: `calc(48px + max(0px, env(safe-area-inset-bottom) - ${BAND_DROP_PX}px) + 12px)` }}
    >
      {mode === "ios" ? (
        <p className="m-0 min-w-0">
          Add ADED to your Home Screen: tap{" "}
          <Share className="inline size-3.5 -translate-y-px" strokeWidth={1.5} aria-label="Share" />, then Add to Home Screen.
        </p>
      ) : (
        <button type="button" onClick={() => void install()} className="min-w-0 border-0 bg-transparent p-0 text-left t-meta text-[var(--ink)] underline">
          Install app
        </button>
      )}
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="flex size-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[var(--ink)]"
      >
        <X className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
