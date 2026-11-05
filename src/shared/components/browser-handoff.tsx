"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BAND_DROP_PX } from "@main/layout";
import { isHomeScreenApp } from "@/shared/services/save-public-card-pdf";

type TelegramWebApp = {
  WebApp?: { openLink?: (url: string, options?: { try_instant_view?: boolean }) => void };
};

function subscribe() {
  return () => {};
}

function telegramWebView() {
  return /Telegram/i.test(navigator.userAgent) && !isHomeScreenApp();
}

/** Signed-in Telegram only. The letter link is a different token and stays valid. */
export function BrowserHandoff({ paused, registered }: { paused: boolean; registered: boolean }) {
  const show = useSyncExternalStore(subscribe, telegramWebView, () => false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (document.querySelector("script[data-telegram-web-app]")) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.dataset.telegramWebApp = "1";
    document.head.appendChild(script);
  }, [show]);

  if (!show || paused || !registered) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/account/browser-link", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { url?: string };
      if (!response.ok || !body.url) {
        setNote("Could not open the browser.");
        return;
      }
      const telegram = (window as Window & { Telegram?: TelegramWebApp }).Telegram;
      if (telegram?.WebApp?.openLink) {
        telegram.WebApp.openLink(body.url, { try_instant_view: false });
        return;
      }
      try {
        await navigator.clipboard.writeText(body.url);
        setNote("Link copied. Open it in Safari or Chrome.");
      } catch {
        setNote("Open the menu, then Open in Safari.");
      }
    } catch {
      setNote("Could not open the browser.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-no-swipe
      className="fixed left-1/2 z-40 flex w-max max-w-[min(100%-48px,300px)] -translate-x-1/2 flex-col bg-sky px-3 py-2.5 t-meta text-[var(--ink)]"
      style={{ bottom: `calc(48px + max(0px, env(safe-area-inset-bottom) - ${BAND_DROP_PX}px) + 12px)` }}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="border-0 bg-transparent p-0 text-left t-meta text-[var(--ink)] underline disabled:text-[var(--grey)]"
      >
        Continue in your browser
      </button>
      {note ? <p className="m-0 mt-1">{note}</p> : null}
    </div>
  );
}
