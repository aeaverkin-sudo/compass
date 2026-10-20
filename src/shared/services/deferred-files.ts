/**
 * Zone files picked on the questionnaire. They stay in memory until Create,
 * then upload onto the card the server just wrote. Nothing hits /api/attachments before that.
 */
const held: File[] = [];
let paused = false;

export function holdZoneFile(file: File) {
  held.push(file);
}

export function takeZoneFiles(): File[] {
  const files = held.slice();
  held.length = 0;
  return files;
}

/** While the post-Create upload is in flight, an empty file row is not a failure. */
export function pauseFileRecovery(value: boolean) {
  paused = value;
}

export function fileRecoveryPaused() {
  return paused;
}

/** Match each held file to the server row with the same type and name, then store it. */
export async function uploadHeldZoneFiles(cardId: string, files: File[]) {
  if (files.length === 0) return;
  const { detectAttachmentType } = await import("@/shared/services/portfolio-catalog");
  const { uploadAttachment } = await import("@/shared/services/attachment-upload");
  const { scheduleItemUpsert } = await import("@/shared/services/card-items-sync");
  const { useAppStore } = await import("@/shared/store/app-store");
  const { useUploadStatus } = await import("@/shared/store/upload-status");

  const used = new Set<string>();
  for (const file of files) {
    const type = detectAttachmentType(file);
    const name = file.name.trim();
    const state = useAppStore.getState();
    const card = state.cards.find((entry) => entry.id === cardId);
    const item = state.contactItems.find((entry) => {
      if (used.has(entry.id) || entry.attachmentId || entry.type !== type) return false;
      if (card && !card.contactItemIds.includes(entry.id)) return false;
      return entry.value.trim() === name;
    });
    if (!item) continue;
    used.add(item.id);
    useUploadStatus.getState().setStatus(item.id, { state: "checking" });
    try {
      const ready = await uploadAttachment({ file, kind: type, cardId });
      const next = {
        ...useAppStore.getState().contactItems.find((entry) => entry.id === item.id),
        ...item,
        attachmentId: ready.attachmentId,
        url: "",
      };
      useAppStore.setState({
        contactItems: useAppStore.getState().contactItems.map((entry) => (entry.id === item.id ? next : entry)),
      });
      useUploadStatus.getState().setStatus(item.id, null);
      scheduleItemUpsert(next, { pulse: false });
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : "Upload failed";
      useUploadStatus.getState().fail(item.id, reason);
    }
  }
}
