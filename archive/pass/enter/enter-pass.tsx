"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { clearLocal } from "../invite-actions";

export function EnterPass({ lookup, tokenHash, pay }: { lookup: string; tokenHash: string; pay: boolean }) {
  const router = useRouter();
  const ran = useRef(false);
  const [failed, setFailed] = useState(!tokenHash);

  useEffect(() => {
    if (!tokenHash || ran.current) return;
    ran.current = true;
    void (async () => {
      clearLocal();
      const signed = await createBrowserSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (signed.error) {
        setFailed(true);
        return;
      }
      await hydrateCardsFromServer();
      router.replace(pay ? `/e/${encodeURIComponent(lookup)}/pay` : "/main");
    })();
  }, [lookup, pay, router, tokenHash]);

  return (
    <main className="compass-main flex h-dvh w-full items-center justify-center bg-white px-[var(--gutter)] text-[var(--ink)]">
      <p className="m-0 text-center t-meta text-[var(--grey)]">
        {failed ? "This link has expired. Enter your email on the event page again." : "Opening your pass…"}
      </p>
    </main>
  );
}
