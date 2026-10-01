"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";

type OwnCard = {
  id: string;
  display_name: string;
  is_primary: boolean;
};

type SaveToContactsProps = {
  cardId: string;
  cardToken: string;
};

const PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";

/**
 * On someone else's public card. A signed-in viewer saves the card into
 * their own book, then may offer one of their cards back.
 */
export function SaveToContacts({ cardId, cardToken }: SaveToContactsProps) {
  const [phase, setPhase] = useState<"hidden" | "ready" | "saving" | "saved">("hidden");
  const [promptOpen, setPromptOpen] = useState(false);
  const [ownCards, setOwnCards] = useState<OwnCard[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;

      const owned = await supabase.from("cards").select("id").eq("id", cardId).maybeSingle();
      if (cancelled || owned.data) return;

      const existing = await supabase
        .from("connections")
        .select("id")
        .eq("owner_id", user.id)
        .eq("saved_card_id", cardId)
        .maybeSingle();
      if (cancelled) return;
      setPhase(existing.data ? "saved" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const save = async () => {
    if (phase !== "ready") return;
    setPhase("saving");
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setPhase("hidden");
      return;
    }

    const inserted = await supabase
      .from("connections")
      .upsert(
        { owner_id: userId, saved_card_id: cardId, state: "active" },
        { onConflict: "owner_id,saved_card_id", ignoreDuplicates: true },
      )
      .select("id");

    if (inserted.error) {
      setPhase("ready");
      setMessage("Could not save this card");
      return;
    }

    setPhase("saved");
    if (!inserted.data || inserted.data.length === 0) return;

    const cards = await supabase
      .from("cards")
      .select("id, display_name, is_primary")
      .eq("owner_id", userId);
    if (cards.error || !cards.data || cards.data.length === 0) return;

    const list = (cards.data as OwnCard[]).slice().sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.display_name.localeCompare(b.display_name);
    });
    setOwnCards(list);
    setPromptOpen(true);
  };

  const share = async (fromCardId: string) => {
    if (sharingId) return;
    setSharingId(fromCardId);
    setMessage(null);
    try {
      const response = await fetch("/api/connections/share-back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toCardId: cardId, toCardToken: cardToken, fromCardId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error ?? "Could not share the card");
        setSharingId(null);
        return;
      }
      setPromptOpen(false);
    } catch {
      setMessage("Could not share the card");
      setSharingId(null);
    }
  };

  if (phase === "hidden") return null;

  const primary = ownCards.find((card) => card.is_primary) ?? ownCards[0];
  const others = ownCards.filter((card) => card.id !== primary?.id);

  return (
    <>
      <div className={`${PAD} pb-2 text-center`}>
        {phase === "saved" ? (
          <p className="m-0 text-[13px] font-normal text-[#777]">Saved</p>
        ) : (
          <button
            type="button"
            disabled={phase === "saving"}
            onClick={() => void save()}
            className="border-0 bg-transparent text-[13px] font-normal text-[#111] underline disabled:opacity-40"
          >
            Save to contacts
          </button>
        )}
        {message && !promptOpen ? (
          <p className="mt-2 text-[12px] leading-snug font-normal text-[#111]">{message}</p>
        ) : null}
      </div>
      <Sheet open={promptOpen} onOpenChange={setPromptOpen}>
        <SheetContent aria-label="Share your card back">
          <Dialog.Title className="max-w-xs text-[28px] leading-tight font-light text-[#111]">
            Share your card back?
          </Dialog.Title>
          {primary ? (
            <button
              type="button"
              disabled={sharingId !== null}
              onClick={() => void share(primary.id)}
              className="mt-6 border-0 bg-sky px-6 py-3 text-left text-[13px] font-normal tracking-[0.14em] text-[#111] uppercase disabled:opacity-40"
            >
              {primary.display_name.trim() || "Untitled"}
            </button>
          ) : null}
          {others.length > 0 ? (
            <div className="mt-6">
              <p className="m-0 text-[10px] font-normal tracking-[0.14em] text-[#999] uppercase">Another card</p>
              <ul className="mt-2">
                {others.map((card) => (
                  <li key={card.id} className="border-t border-[#111]/15">
                    <button
                      type="button"
                      disabled={sharingId !== null}
                      onClick={() => void share(card.id)}
                      className="w-full border-0 bg-transparent py-3 text-left text-[15px] font-normal text-[#111] disabled:opacity-40"
                    >
                      {card.display_name.trim() || "Untitled"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {message && promptOpen ? (
            <p className="mt-4 max-w-xs text-[13px] leading-snug font-normal text-[#111]">{message}</p>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
