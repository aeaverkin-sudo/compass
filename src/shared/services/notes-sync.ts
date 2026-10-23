import type { Card, NextScanAddon } from "@/shared/types";
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

type NoteHandoff = { via: "link" | "pdf"; token: string };

const RELEASED_KEY = "compass-released-notes";
const handedOff = new Map<string, NoteHandoff>();
/** The list captured at the share tap. Only this object may still upload after the tap. */
const releaseSnapshots = new Map<string, Card>();

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
        if (hold?.via === "link" || hold?.via === "pdf") handedOff.set(id, hold);
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
  return inFlight.has(cardId) || waiting.has(cardId);
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
  const { useAppStore } = await import("@/shared/store/app-store");
  const ordered = orderNextScanAddons(notes);
  useAppStore.setState({
    cards: useAppStore.getState().cards.map((card) =>
      card.id === cardId ? { ...card, nextScanAddons: ordered } : card,
    ),
  });
}

async function openTransfer(cardId: string): Promise<string> {
  const response = await fetch("/api/notes/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId }),
  });
  const body = await readJson<{ transferId?: string }>(response);
  if (!body.transferId) throw new Error("Could not open the note");
  return body.transferId;
}

async function putNotes(
  cardId: string,
  notes: { type: NextScanAddon["type"]; content: string; attachmentId?: string }[],
) {
  const response = await fetch("/api/notes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, notes }),
  });
  await readJson(response);
}

const rerun = new Set<string>();

async function pushNotes(snapshot: Card) {
  if (!isCardUuid(snapshot.id)) return;
  // Notes already handed to a link stay there until that one open.
  // A cleared card must not delete them, and a later list must not replace them.
  if (handoffFor(snapshot.id)?.via === "link" && releaseSnapshots.get(snapshot.id) !== snapshot) return;
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
      if (hold?.via === "link") return;
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
    const transferId = needsFile ? await openTransfer(card.id) : undefined;

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
    if (snapshot.nextScanAddons.length === 0 && !again) clearing.delete(snapshot.id);
    if (again) {
      const { useAppStore } = await import("@/shared/store/app-store");
      const latest = useAppStore.getState().cards.find((card) => card.id === snapshot.id);
      if (!latest || handoffFor(latest.id)?.via === "link") return;
      void pushNotes(latest);
    }
  }
}

/** Push the latest notes for this card. File bytes upload before the row is saved. */
export function scheduleNotesSync(card: Card) {
  if (!isCardUuid(card.id)) return;
  bumpNotes(card.id);
  if (card.nextScanAddons.length === 0) clearing.add(card.id);
  else {
    clearing.delete(card.id);
    // A link handoff stays until that one open is taken. New notes wait on the card.
    if (handoffFor(card.id)?.via !== "link") clearHandoff(card.id);
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

/** After the upload of this tap lands, a later scan must not take the same notes. */
async function sealSharedNotes(cardId: string) {
  await waitUntilNotesIdle(cardId);
  releaseSnapshots.delete(cardId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("/api/notes/arm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (response.ok) return;
    } catch {
      // Retry. Until this lands, a scan could still take the notes.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/**
 * The previous send may already have been opened. If it has, this tap is a new send.
 * If it is still waiting for its one open, notes added since then stay on the card.
 */
async function releaseAgainIfFree(cardId: string, token: string) {
  try {
    const response = await fetch(`/api/notes?cardId=${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { held?: boolean };
    if (body.held) return;
  } catch {
    return;
  }
  clearHandoff(cardId);
  releaseOwnerNotes(cardId, "link", token);
}

export function notesHandoffActive(cardId: string) {
  return handoffFor(cardId)?.via === "link";
}

/**
 * The send already happened. Drop every note off the card at once, one or two.
 * A link keeps them for the one open. A later scan does not get them.
 * A PDF burns them, because the file already holds them.
 */
export function releaseOwnerNotes(cardId: string, via: "link" | "pdf", token: string) {
  if (via === "link" && handoffFor(cardId)?.via === "link") {
    void releaseAgainIfFree(cardId, token);
    return;
  }
  markHandoff(cardId, { via, token });
  const pending = waiting.get(cardId);
  if (pending) {
    clearTimeout(pending.timer);
    waiting.delete(cardId);
    if (via === "link") releaseSnapshots.set(cardId, pending.card);
    void pushNotes(pending.card);
  } else if (via === "pdf" && !inFlight.has(cardId)) {
    void consumeSharedNotes(token);
  }
  if (via === "link") void sealSharedNotes(cardId);
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
        const body = await readJson<{ notes?: NextScanAddon[]; held?: boolean }>(response);
        const notes = body.notes ?? [];
        if (clearing.has(card.id)) return;
        // The sent batch is waiting for its one open. This card does not get it back.
        // Notes added on this device after the tap stay; a handoff marks that batch.
        if (body.held) {
          if (!handoffFor(card.id)) await writeLocal(card.id, []);
          return;
        }
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
