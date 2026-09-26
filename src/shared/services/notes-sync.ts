import type { Card, NextScanAddon } from "@/shared/types";
import { fileFromDataUrl, uploadTransferAsset } from "@/shared/services/attachment-upload";
import { orderNextScanAddons } from "@/shared/services/notes-order";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEBOUNCE_MS = 300;

const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; card: Card }>();
const inFlight = new Set<string>();

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
  if (inFlight.has(snapshot.id)) {
    rerun.add(snapshot.id);
    return;
  }
  inFlight.add(snapshot.id);
  try {
    const { useAppStore } = await import("@/shared/store/app-store");
    const live = () => useAppStore.getState().cards.find((card) => card.id === snapshot.id);
    const card = live() ?? snapshot;
    const before = signature(card.nextScanAddons);
    const ordered = orderNextScanAddons(card.nextScanAddons);

    if (ordered.length === 0) {
      await putNotes(card.id, []);
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
    if (after && signature(after.nextScanAddons) !== before && uploaded.size === 0) {
      scheduleNotesSync(after);
    }
  } catch (error) {
    console.error("[notes] sync failed", error);
  } finally {
    inFlight.delete(snapshot.id);
    if (rerun.delete(snapshot.id)) {
      const { useAppStore } = await import("@/shared/store/app-store");
      const latest = useAppStore.getState().cards.find((card) => card.id === snapshot.id);
      if (latest) void pushNotes(latest);
    }
  }
}

/** Push the latest notes for this card. File bytes upload before the row is saved. */
export function scheduleNotesSync(card: Card) {
  if (!isCardUuid(card.id)) return;
  const previous = waiting.get(card.id);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    waiting.delete(card.id);
    void pushNotes(card);
  }, DEBOUNCE_MS);
  waiting.set(card.id, { timer, card });
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
        const response = await fetch(`/api/notes?cardId=${card.id}`);
        if (response.status === 404) return;
        const body = await readJson<{ notes?: NextScanAddon[] }>(response);
        await writeLocal(card.id, body.notes ?? []);
      } catch (error) {
        console.error("[notes] load failed", error);
      }
    }),
  );
}
