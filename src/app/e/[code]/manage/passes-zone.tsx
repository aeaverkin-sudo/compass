"use client";

import { Zone } from "@/shared/components/zone";
import { guestPassUrl, type GuestPass } from "@/shared/event/guest-book";

export function PassesZone({
  passes,
  inviteUrl,
  onNotice,
}: {
  passes: GuestPass[];
  inviteUrl: string;
  onNotice: (text: string) => void;
}) {
  const copy = async () => {
    const text = passes.map((pass) => `${pass.name} — ${guestPassUrl(inviteUrl, pass.token)}`).join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      onNotice("Links copied");
    } catch {
      onNotice("Could not copy");
    }
  };

  return (
    <Zone label="Passes">
      <button
        type="button"
        onClick={() => void copy()}
        className="press block border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
      >
        {`Copy ${passes.length} ${passes.length === 1 ? "link" : "links"}`}
      </button>
      <p className="mt-3 mb-0 t-meta text-[var(--grey)]">
        Phone only. Send them in WhatsApp or Telegram — or one by one from the list.
      </p>
    </Zone>
  );
}
