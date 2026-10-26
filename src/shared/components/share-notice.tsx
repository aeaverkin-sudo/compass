"use client";

import { useEffect, useState } from "react";
import { onShareNotice } from "@/shared/lib/card-share-guard";
import { SkyToast } from "@/shared/components/sky-toast";

/** The share error name, long enough to read on the phone. */
export function ShareNotice() {
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => onShareNotice((text) => setNotice({ id: Date.now(), text })), []);

  if (!notice) return null;
  return <SkyToast key={notice.id} text={notice.text} holdMs={2500} onDone={() => setNotice(null)} />;
}
