const MARKERS = ["telegram", "instagram", "fban", "fbav", "line/", "; wv)"];

/** True inside Telegram, Instagram, Facebook, Line, and the generic Android WebView. Google OAuth refuses those agents. */
export function isInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const agent = navigator.userAgent.toLowerCase();
  return MARKERS.some((marker) => agent.includes(marker));
}
