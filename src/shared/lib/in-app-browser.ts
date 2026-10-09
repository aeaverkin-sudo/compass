const MARKERS = ["telegram", "instagram", "fban", "fbav", "line/", "; wv)"];

/** True inside Telegram, Instagram, Facebook, Line, and the generic Android WebView. Google OAuth refuses those agents. */
export function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const agent = navigator.userAgent.toLowerCase();
  return MARKERS.some((marker) => agent.includes(marker));
}

export type PublicBandHost = "safari-ios" | "telegram" | "instagram" | "generic-webview" | "none";

const WEBVIEW = /(FBAN|FBAV|Instagram|Telegram|Line|TikTok|Snapchat|MicroMessenger)/i;

/** iPhone or iPad Safari. Chrome, Firefox, Edge and in-app webviews are not this. */
export function isMobileSafari(ua = liveAgent()) {
  if (!iosDevice(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS/i.test(ua)) return false;
  if (isInAppWebview(ua)) return false;
  return /Safari/i.test(ua);
}

/** Telegram, Instagram, Facebook, Line, TikTok, Snapchat, WeChat. */
export function isInAppWebview(ua = liveAgent()) {
  return WEBVIEW.test(ua);
}

/**
 * Which bottom bar covers the public band.
 * A home-screen app is `none`: its UA is still Safari, and it has no browser bar.
 */
export function publicBandHost(ua = liveAgent(), installed = installedApp()): PublicBandHost {
  if (/Telegram/i.test(ua)) return "telegram";
  if (/Instagram/i.test(ua)) return "instagram";
  if (isInAppWebview(ua)) return "generic-webview";
  if (installed) return "none";
  if (isMobileSafari(ua)) return "safari-ios";
  return "none";
}

/** Pixels the public band keeps clear of a bar the visual viewport does not report. */
export function publicBandLiftPx(host: PublicBandHost) {
  if (host === "safari-ios") return 44;
  if (host === "instagram") return 60;
  if (host === "telegram" || host === "generic-webview") return 56;
  return 0;
}

function liveAgent() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

function iosDevice(ua: string) {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (typeof navigator === "undefined") return false;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function installedApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}
