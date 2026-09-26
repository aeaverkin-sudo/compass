import type { NextScanAddonType } from "@/shared/types";

export type DeliveredNote = {
  id: string;
  type: NextScanAddonType;
  content: string;
  /** Short-lived signed URL for selfie/voice. Empty when the file is gone. */
  url: string;
  expired: boolean;
};
