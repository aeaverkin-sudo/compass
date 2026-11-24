import { isInstalledApp } from "@/shared/lib/home-entry";
import { STEPS } from "@/shared/lib/funnel-steps";

export type FunnelStep = (typeof STEPS)[number];

const IN_APP = ["fban", "fbav", "line/", "; wv)"];

/** Google refuses these browsers. The buttons stay hidden there. */
export function socialSignInBlocked() {
  if (typeof navigator === "undefined") return true;
  const client = readClient();
  if (client === "telegram" || client === "instagram") return true;
  const agent = navigator.userAgent.toLowerCase();
  return IN_APP.some((marker) => agent.includes(marker));
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

/** Product statistics are off. These names stay so sign-in can call them without recording anything. */
export function markGooglePending(_provider: "google" | "apple" = "google"): void {}

export function clearGooglePending(): void {}

export function settleGoogleReturn(_registered: boolean): void {}

export function track(_step: FunnelStep, _detail?: string): void {}
