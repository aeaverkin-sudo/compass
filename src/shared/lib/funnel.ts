import { isInstalledApp } from "@/shared/lib/home-entry";

const KEY = "aded-funnel";
const STEPS = [
  "landing_view",
  "landing_cta",
  "signin_view",
  "create_view",
  "create_submit",
  "create_red",
  "signup_ok",
  "signup_fail",
] as const;

export type FunnelStep = (typeof STEPS)[number];

const DETAIL = /^[a-z0-9_,:-]{1,60}$/;
const UTM = /^[a-z0-9_-]{1,30}$/;

type Bag = {
  session: string;
  once: string[];
  reds: number;
  total: number;
  source: string;
};

let memory: Bag | null = null;

function randomSession() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let session = "";
  for (const byte of bytes) session += alphabet[byte % alphabet.length] ?? "a";
  return session;
}

function save(bag: Bag) {
  memory = bag;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(bag));
  } catch {
    // A private tab keeps the mark in memory only.
  }
}

function load(): Bag {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Bag>;
      if (typeof parsed.session === "string" && /^[a-z0-9]{12,32}$/.test(parsed.session)) {
        memory = {
          session: parsed.session,
          once: Array.isArray(parsed.once) ? parsed.once.filter((item) => typeof item === "string") : [],
          reds: typeof parsed.reds === "number" ? parsed.reds : 0,
          total: typeof parsed.total === "number" ? parsed.total : 0,
          source: typeof parsed.source === "string" ? parsed.source : "",
        };
        return memory;
      }
    }
  } catch {
    // sessionStorage can be closed. The tab still gets one memory session.
  }
  const bag: Bag = { session: randomSession(), once: [], reds: 0, total: 0, source: "" };
  save(bag);
  return bag;
}

function readSource() {
  const query = new URLSearchParams(window.location.search);
  const utm = (query.get("utm_source") ?? "").trim().toLowerCase();
  if (UTM.test(utm)) return utm;
  if (query.get("src") === "qr") return "qr";
  if (!document.referrer) return "direct";
  let host = "";
  try {
    host = new URL(document.referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "other";
  }
  if (host === "google" || host.startsWith("google.") || host.includes(".google.")) return "google";
  if (host === "t.me" || host === "telegram.org" || host.endsWith(".telegram.org")) return "telegram";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com")) return "facebook";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "whatsapp.com" || host.endsWith(".whatsapp.com") || host === "wa.me") return "whatsapp";
  if (host === "x.com" || host === "t.co") return "x";
  if (host === "adedme.com" || host.endsWith(".adedme.com")) return "adedme";
  return "other";
}

function readClient() {
  try {
    if (isInstalledApp()) return "pwa";
  } catch {
    // A missing display-mode check is just a browser.
  }
  const agent = navigator.userAgent;
  if (/Telegram/i.test(agent)) return "telegram";
  if (/Instagram/i.test(agent)) return "instagram";
  if (/Edg|OPR|Opera/i.test(agent)) return "other";
  if (/CriOS|Chrome/i.test(agent)) return "chrome";
  if (/Safari/i.test(agent)) return "safari";
  return "other";
}

/** One note beside the path the person already took. It never throws and is never awaited. */
export function track(step: FunnelStep, detail?: string): void {
  try {
    if (typeof window === "undefined") return;
    if (!STEPS.includes(step)) return;
    const bag = load();
    if (bag.total >= 50) return;
    if (step === "create_red") {
      if (bag.reds >= 5) return;
      bag.reds += 1;
    } else if (bag.once.includes(step)) {
      return;
    } else {
      bag.once.push(step);
    }
    bag.total += 1;
    if (!bag.source) bag.source = readSource();
    save(bag);
    const clean = detail && DETAIL.test(detail) ? detail : undefined;
    const body = JSON.stringify({
      session: bag.session,
      step,
      ...(clean ? { detail: clean } : {}),
      client: readClient(),
      source: bag.source,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/f", blob)) return;
    void fetch("/api/f", {
      method: "POST",
      body: blob,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // A broken note must not reach the person.
  }
}
