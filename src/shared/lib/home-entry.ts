import { deviceWasRegistered, signInPath } from "@/shared/lib/registered-device";
import { useAppStore } from "@/shared/store/app-store";
import type { Card } from "@/shared/types";

export type HomeGate = {
  hydrated: boolean;
  sessionReady: boolean;
  cardsReady: boolean;
  needsSignIn: boolean;
  onboarded: boolean;
  cards: Card[];
};

/** A trial card already has a name or a photo, even if onboarding was not flipped. */
export function trialCardStarted(cards: Card[]) {
  return cards.some(
    (card) => card.displayName.trim().length > 0 || Boolean(card.photo) || Boolean(card.photoAttachmentId),
  );
}

/** The installed app. A browser tab is never this, so the public address can stay on the landing. */
export function isInstalledApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/**
 * Where `/` used to send the person, once the phone has caught up.
 * A live session is onboarded and goes to Main. A registered device goes to
 * sign-in only when that session is gone — checking the device first would
 * ask a signed-in person for the password again.
 * Null means keep waiting.
 */
export function homeEntryHref(gate: HomeGate): string | null {
  if (!gate.hydrated || !gate.sessionReady) return null;
  if (gate.needsSignIn) return signInPath();
  if (gate.onboarded) return "/main";
  if (!gate.cardsReady) return null;
  if (trialCardStarted(gate.cards)) return "/main";
  if (deviceWasRegistered()) return signInPath();
  return "/create";
}

/** The started trial is a portfolio, so Main will not send it back to the landing. */
export function noteTrialCardStarted() {
  const state = useAppStore.getState();
  if (state.user.onboarded || !trialCardStarted(state.cards)) return;
  useAppStore.setState({ user: { ...state.user, onboarded: true } });
}
