"use client";

import { SkyToast } from "@/shared/components/sky-toast";
import { useUploadStatus } from "@/shared/store/upload-status";

/** Why the last file upload failed. One toast for every card on the screen. */
export function UploadNotice() {
  const notice = useUploadStatus((state) => state.notice);
  const clearNotice = useUploadStatus((state) => state.clearNotice);
  if (!notice) return null;
  return <SkyToast key={notice.id} text={notice.text} onDone={clearNotice} />;
}
