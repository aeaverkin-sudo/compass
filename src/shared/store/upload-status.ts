"use client";

import { create } from "zustand";
import { fileRecoveryPaused } from "@/shared/services/deferred-files";

/** Live state of one file row. Not persisted: a reload re-checks the row on the server. */
export type FileRowStatus =
  | { state: "uploading"; percent: number | null }
  | { state: "checking" }
  | { state: "failed" };

/** Grey line under a file row. A row with no file, no link and no live state has failed. */
export function fileStatusLine(status: FileRowStatus | undefined, url: string): string | null {
  if (!status && fileRecoveryPaused()) return null;
  if (status?.state === "uploading") {
    return status.percent == null ? "Uploading…" : `Uploading… ${status.percent}%`;
  }
  if (status?.state === "failed" || (!status && !url)) return "Upload failed — tap to try again";
  return null;
}

interface UploadStatusState {
  byItem: Record<string, FileRowStatus>;
  notice: { id: number; text: string } | null;
  setStatus: (itemId: string, status: FileRowStatus | null) => void;
  /** Failed row plus the reason as a toast. */
  fail: (itemId: string, reason: string) => void;
  notify: (text: string) => void;
  clearNotice: () => void;
}

export const useUploadStatus = create<UploadStatusState>()((set) => ({
  byItem: {},
  notice: null,
  setStatus: (itemId, status) =>
    set((state) => {
      const byItem = { ...state.byItem };
      if (status) byItem[itemId] = status;
      else delete byItem[itemId];
      return { byItem };
    }),
  fail: (itemId, reason) =>
    set((state) => ({
      byItem: { ...state.byItem, [itemId]: { state: "failed" } },
      notice: { id: Date.now(), text: reason },
    })),
  notify: (text) => set({ notice: { id: Date.now(), text } }),
  clearNotice: () => set({ notice: null }),
}));
