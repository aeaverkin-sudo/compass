"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function KeepProfileButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const keep = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account/keep", { method: "POST" });
      const reply = (await response.json()) as { kept?: boolean; next?: string };
      if (reply.next) {
        router.push(reply.next);
        return;
      }
      if (reply.kept) {
        await createBrowserSupabaseClient().auth.refreshSession();
        markRegisteredDevice();
        window.location.reload();
        return;
      }
    } catch {
      // The button stays for another try.
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      data-card-content
      data-no-swipe
      disabled={busy}
      onClick={() => void keep()}
      className={cn("press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:text-[var(--grey)]", className)}
    >
      Keep my profile
    </button>
  );
}
