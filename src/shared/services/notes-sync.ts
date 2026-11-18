import type { Card, NextScanAddon } from "@/shared/types";
import { handleCode, isNoteCode } from "@/shared/services/card-handle";
import { fileFromDataUrl, uploadTransferAsset } from "@/shared/services/attachment-upload";
import { orderNextScanAddons } from "@/shared/services/notes-order";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEBOUNCE_MS = 300;

const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; card: Card }>();
const inFlight = new Set<string>();
/** An owner delete is in flight. Hydrate must not put the server copy back on the card. */
const clearing = new Set<string>();
/** Bumped on every local notes change. A load that started earlier must not overwrite it. */
const noteEpoch = new Map<string, number>();

function bumpNotes(cardId: string) {
  noteEpoch.set(cardId, (noteEpoch.get(cardId) ?? 0) + 1);
}

type NoteHandoff = { via: "pdf"; token: string };

const RELEASED_KEY = "compass-released-notes";
const handedOff = new Map<string, NoteHandoff>();
/** Code for the draft still on the card. Share takes it and the next note gets a new one. */
const draftCodes = new Map<string, string>();
/** A share is uploading this card's batch. New notes wait until it is sent. */
const dispatching = new Set<string>();
const queuedAfterDispatch = new Map<string, Card>();

function ensureDraftCode(cardId: string) {
  const existing = draftCodes.get(cardId);
  if (existing && isNoteCode(existing)) return existing;
  const code = handleCode();
  draftCodes.set(cardId, code);
  return code;
}

function rememberHandoff() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RELEASED_KEY, JSON.stringify([...handedOff.entries()]));
}

function handoffFor(cardId: string): NoteHandoff | undefined {
  if (handedOff.size === 0 && typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(RELEASED_KEY);
      const entries = raw ? (JSON.parse(raw) as [string, NoteHandoff][]) : [];
      for (const [id, hold] of entries) {
        if (hold?.via === "pdf") handedOff.set(id, hold);
      }
    } catch {
      // A broken record must not put a sent note back on the card.
    }
  }
  return handedOff.get(cardId);
}

function markHandoff(cardId: string, hold: NoteHandoff) {
  handoffFor(cardId);
  handedOff.set(cardId, hold);
  rememberHandoff();
}

function clearHandoff(cardId: string) {
  handoffFor(cardId);
  if (!handedOff.delete(cardId)) return;
  rememberHandoff();
}

async function consumeSharedNotes(token: string) {
  await fetch(`/api/c/${encodeURIComponent(token)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "consume" }),
  });
}

function isCardUuid(id: string) {
  return UUID_RE.test(id);
}

export function notesAreSyncing(cardId: string) {
  return inFlight.has(cardId) || waiting.has(cardId) || dispatching.has(cardId);
}

function signature(notes: NextScanAddon[]) {
  return orderNextScanAddons(notes)
    .map((note) => `${note.id}:${note.type}:${note.type === "text" ? note.content : (note.attachmentId ?? note.content)}`)
    .join("|");
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

async function writeLocal(cardId: string, notes: NextScanAddon[]) {
  // A share already took this list. Don't put it back on the card.
  if (notes.length > 0 && (clearing.has(cardId) || dispatching.has(cardId))) return;
  bumpNotes(cardId);
  const { useAppStore } = await import("@/shared/store/app-store");
  if (notes.length > 0 && (clearing.has(cardId) || dispatching.has(cardId))) return;
  const ordered = orderNextScanAddons(notes);
  useAppStore.setState({
    cards: useAppStore.getState().cards.map((card) =>
      card.id === cardId ? { ...card, nextScanAddons: ordered } : card,
    ),
  });
}

/** A scan took the notes, or another screen already sent them. Drop them here. */
export function forgetLocalNotes(cardId: string) {
  if (notesAreSyncing(cardId)) return;
  const seen = noteEpoch.get(cardId) ?? 0;
  void import("@/shared/store/app-store").then(({ useAppStore }) => {
    if ((noteEpoch.get(cardId) ?? 0) !== seen) return;
    if (notesAreSyncing(cardId)) return;
    const card = useAppStore.getState().cards.find((entry) => entry.id === cardId);
    if (!card?.nextScanAddons.length) return;
    void writeLocal(cardId, []);
  });
}

async function openTransfer(cardId: string, code?: string): Promise<string> {
  const response = await fetch("/api/notes/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, token: code }),
  });
  const body = await readJson<{ transferId?: string }>(response);
  if (!body.transferId) throw new Error("Could not open the note");
  return body.transferId;
}

async function putNotes(
  cardId: string,
  notes: { type: NextScanAddon["type"]; content: string; attachmentId?: string }[],
  dispatch?: string,
) {
  const response = await fetch("/api/notes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, notes, dispatch }),
  });
  await readJson(response);
}

const rerun = new Set<string>();

async function pushNotes(snapshot: Card) {
  if (!isCardUuid(snapshot.id)) return;
  const draftCode = draftCodes.get(snapshot.id);
  // This share owns the row. Don't write a later list into it, and don't clear it.
  if (dispatching.has(snapshot.id)) return;
  if (snapshot.nextScanAddons.length === 0) clearing.add(snapshot.id);
  else clearing.delete(snapshot.id);
  if (inFlight.has(snapshot.id)) {
    rerun.add(snapshot.id);
    return;
  }
  inFlight.add(snapshot.id);
  try {
    const { useAppStore } = await import("@/shared/store/app-store");
    const live = () => useAppStore.getState().cards.find((card) => card.id === snapshot.id);
    // Upload the list this call was given. The live card may already be empty from the share tap.
    const card = snapshot;
    const before = signature(card.nextScanAddons);
    const ordered = orderNextScanAddons(card.nextScanAddons);

    if (ordered.length === 0) {
      const hold = handoffFor(card.id);
      // This share owns the row. An older empty sync must not delete it.
      if (dispatching.has(card.id)) return;
      clearHandoff(card.id);
      await putNotes(card.id, []);
      if (hold?.via === "pdf") await consumeSharedNotes(hold.token);
      const pending = waiting.get(card.id);
      if (!pending || pending.card.nextScanAddons.length === 0) {
        const current = live();
        if (current && current.nextScanAddons.length > 0) await writeLocal(card.id, []);
      }
      return;
    }

    const needsFile = ordered.some(
      (note) =>
        note.type !== "text" &&
        !note.attachmentId &&
        (note.content.startsWith("data:") || note.content.startsWith("blob:")),
    );
    const transferId = needsFile ? await openTransfer(card.id, draftCode) : undefined;

    const payload: { type: NextScanAddon["type"]; content: string; attachmentId?: string }[] = [];
    const uploaded = new Map<string, string>();

    for (const note of ordered) {
      if (note.type === "text") {
        const content = note.content.trim();
        if (content) payload.push({ type: "text", content });
        continue;
      }
      let attachmentId = note.attachmentId;
      if (!attachmentId && transferId && (note.content.startsWith("data:") || note.content.startsWith("blob:"))) {
        const file = await fileFromDataUrl(note.content, note.type === "selfie" ? "selfie.jpg" : "voice.webm");
        const ready = await uploadTransferAsset({ file, kind: note.type, transferId });
        attachmentId = ready.attachmentId;
        uploaded.set(note.id, attachmentId);
      }
      if (attachmentId) payload.push({ type: note.type, content: "", attachmentId });
    }

    await putNotes(card.id, payload);

    const sent = handoffFor(card.id);
    if (sent?.via === "pdf") await consumeSharedNotes(sent.token);
    if (sent) return;

    const latest = live();
    if (!latest) return;
    if (uploaded.size > 0) {
      await writeLocal(
        card.id,
        latest.nextScanAddons.map((note) => {
          const attachmentId = uploaded.get(note.id);
          if (!attachmentId) return note;
          return { ...note, attachmentId, content: "" };
        }),
      );
    }
    const after = live();
    // Do not schedule an empty list from here. That empty list is the rail clearing after a share,
    // and the server copy still belongs to whoever opens the link.
    if (after && after.nextScanAddons.length > 0 && signature(after.nextScanAddons) !== before && uploaded.size === 0) {
      scheduleNotesSync(after);
    }
  } catch (error) {
    console.error("[notes] sync failed", error);
  } finally {
    inFlight.delete(snapshot.id);
    const again = rerun.delete(snapshot.id);
    if (snapshot.nextScanAddons.length === 0 && !again && !dispatching.has(snapshot.id)) {
      clearing.delete(snapshot.id);
    }
    if (again && !dispatching.has(snapshot.id)) {
      const { useAppStore } = await import("@/shared/store/app-store");
      const latest = useAppStore.getState().cards.find((card) => card.id === snapshot.id);
      if (!latest) return;
      void pushNotes(latest);
    }
  }
}

/** Push the latest notes for this card. File bytes upload before the row is saved. */
export function scheduleNotesSync(card: Card) {
  if (!isCardUuid(card.id)) return;
  if (dispatching.has(card.id)) {
    if (card.nextScanAddons.length > 0) queuedAfterDispatch.set(card.id, card);
    return;
  }
  if (card.nextScanAddons.length > 0) ensureDraftCode(card.id);
  bumpNotes(card.id);
  if (card.nextScanAddons.length === 0) clearing.add(card.id);
  else {
    clearing.delete(card.id);
    clearHandoff(card.id);
  }
  const previous = waiting.get(card.id);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    waiting.delete(card.id);
    void pushNotes(card);
  }, DEBOUNCE_MS);
  waiting.set(card.id, { timer, card });
}

/** Start a waiting upload now, so a share can carry the selfie that was just added. */
export function flushNotesSync(cardId: string) {
  const pending = waiting.get(cardId);
  if (!pending) return;
  clearTimeout(pending.timer);
  waiting.delete(cardId);
  void pushNotes(pending.card);
}

function waitUntilNotesIdle(cardId: string) {
  if (!inFlight.has(cardId) && !rerun.has(cardId)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (!inFlight.has(cardId) && !rerun.has(cardId)) {
        clearInterval(timer);
        resolve();
      }
    }, 40);
  });
}

async function sealDispatch(cardId: string, code: string): Promise<boolean> {
  const response = await fetch("/api/notes/seal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, token: code }),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { ready?: boolean };
  return body.ready === true;
}

/** The share tap. The code is already on the link. Upload this list, then mark the row sent. */
async function deliverDispatch(snapshot: Card, code: string) {
  await waitUntilNotesIdle(snapshot.id);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const ordered = orderNextScanAddons(snapshot.nextScanAddons);
        const payload: { type: NextScanAddon["type"]; content: string; attachmentId?: string }[] = [];
        const needsFile = ordered.some(
          (note) =>
            note.type !== "text" &&
            !note.attachmentId &&
            (note.content.startsWith("data:") || note.content.startsWith("blob:")),
        );
        const transferId = needsFile ? await openTransfer(snapshot.id, code) : undefined;
        for (const note of ordered) {
          if (note.type === "text") {
            const content = note.content.trim();
            if (content) payload.push({ type: "text", content });
            continue;
          }
          let attachmentId = note.attachmentId;
          if (!attachmentId && transferId && (note.content.startsWith("data:") || note.content.startsWith("blob:"))) {
            const file = await fileFromDataUrl(note.content, note.type === "selfie" ? "selfie.jpg" : "voice.webm");
            const ready = await uploadTransferAsset({ file, kind: note.type, transferId });
            attachmentId = ready.attachmentId;
          }
          if (attachmentId) payload.push({ type: note.type, content: "", attachmentId });
        }
        if (!needsFile) await openTransfer(snapshot.id, code);
        if (payload.length === 0) return;
        await putNotes(snapshot.id, payload, code);
        if (await sealDispatch(snapshot.id, code)) return;
      } catch (error) {
        console.error("[notes] send failed", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    dispatching.delete(snapshot.id);
    clearing.delete(snapshot.id);
    const next = queuedAfterDispatch.get(snapshot.id);
    queuedAfterDispatch.delete(snapshot.id);
    if (next && next.nextScanAddons.length > 0) scheduleNotesSync(next);
  }
}

/**
 * Share was tapped. Returns the code for the link and clears the local list's epoch.
 * The caller drops the notes from the card before showing the share sheet.
 */
export function claimShare(card: Card): string | null {
  if (!isCardUuid(card.id) || card.nextScanAddons.length === 0) return null;
  const code = ensureDraftCode(card.id);
  draftCodes.delete(card.id);
  clearHandoff(card.id);
  bumpNotes(card.id);
  clearing.add(card.id);
  dispatching.add(card.id);
  const pending = waiting.get(card.id);
  if (pending) {
    clearTimeout(pending.timer);
    waiting.delete(card.id);
  }
  const snapshot: Card = { ...card, nextScanAddons: card.nextScanAddons.map((note) => ({ ...note })) };
  void deliverDispatch(snapshot, code);
  return code;
}

/**
 * The PDF already holds the notes. Burn that batch and drop it off the card.
 */
export function releaseOwnerNotes(cardId: string, via: "pdf", token: string) {
  markHandoff(cardId, { via, token });
  const pending = waiting.get(cardId);
  if (pending) {
    clearTimeout(pending.timer);
    waiting.delete(cardId);
    void pushNotes(pending.card);
  } else if (!inFlight.has(cardId)) {
    void consumeSharedNotes(token);
  }
  void writeLocal(cardId, []);
}

export function dropPendingNotes() {
  for (const pending of waiting.values()) clearTimeout(pending.timer);
  waiting.clear();
  clearing.clear();
}

function flushWaiting() {
  for (const [id, pending] of waiting) {
    clearTimeout(pending.timer);
    waiting.delete(id);
    void pushNotes(pending.card);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWaiting();
  });
}

/** Server pending notes replace the local list. An empty pending list clears them. */
export async function hydrateNotes(): Promise<void> {
  const { useAppStore } = await import("@/shared/store/app-store");
  const cards = useAppStore.getState().cards.filter((card) => isCardUuid(card.id));
  await Promise.all(
    cards.map(async (card) => {
      try {
        const seen = noteEpoch.get(card.id) ?? 0;
        const response = await fetch(`/api/notes?cardId=${card.id}`);
        if (response.status === 404) return;
        if ((noteEpoch.get(card.id) ?? 0) !== seen) return;
        const body = await readJson<{ notes?: NextScanAddon[] }>(response);
        const notes = body.notes ?? [];
        if (clearing.has(card.id)) return;
        if (handoffFor(card.id)) {
          if (notes.length === 0) {
            clearHandoff(card.id);
            const local = useAppStore.getState().cards.find((entry) => entry.id === card.id);
            if (local && local.nextScanAddons.length > 0) scheduleNotesSync(local);
          }
          return;
        }
        await writeLocal(card.id, notes);
      } catch (error) {
        console.error("[notes] load failed", error);
      }
    }),
  );
}
