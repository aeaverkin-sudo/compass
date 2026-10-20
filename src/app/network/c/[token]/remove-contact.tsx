"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

/** Same inset as the card body, then the value column. */
const CARD_PAD = "clamp(24px, 6.1vw, 28px) - 3mm";

export function RemoveContact({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        setBusy(false);
        return;
      }
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("owner_id", userId)
        .eq("saved_card_token", token);
      if (error) {
        setBusy(false);
        return;
      }
      router.push("/network");
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      className="pb-[max(2.5rem,env(safe-area-inset-bottom))]"
      style={{ paddingTop: 18, paddingLeft: `calc(${CARD_PAD} + ${VALUE_AXIS_PX}px)` }}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="press border-0 bg-sky px-[21.6px] py-[10.8px] t-band leading-[calc(13px*1.45)] text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
      >
        Delete from account
      </button>
    </div>
  );
}
