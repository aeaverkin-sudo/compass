"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hand } from "lucide-react";
import { ScreenHeader } from "@/shared/components/screen-header";
import type { ExternalContact } from "@/features/contact-collect/types";

const ROW = "border-b border-[var(--rule)] py-[14px]";

export function ContactScreen({ contact }: { contact: ExternalContact }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swapped = Boolean(contact.pushbackAt);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/external-contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not delete the contact.");
        setBusy(false);
        setArmed(false);
        return;
      }
      router.replace("/network");
    } catch {
      setError("Could not delete the contact.");
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <ScreenHeader title={contact.displayName.trim() || "Contact"} fallbackHref="/network" />
        <div className="flex items-center gap-3 pb-[18px]">
          <span className="size-16 shrink-0 bg-[#f3f3f3]">
            {contact.photoUrl ? <img src={contact.photoUrl} alt="" className="size-full object-cover" /> : null}
          </span>
          <p className="m-0 flex min-w-0 items-center gap-1.5 t-body">
            <span className="min-w-0 truncate">{contact.displayName.trim() || "Untitled"}</span>
            <Hand className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          </p>
        </div>
        {contact.position ? <p className={`m-0 t-body ${ROW}`}>{contact.position}</p> : null}
        {contact.company ? <p className={`m-0 t-body ${ROW}`}>{contact.company}</p> : null}
        {contact.lines.map((line, index) => (
          <p key={`${index}-${line.value}`} className={`m-0 t-body ${ROW}`}>
            {line.value}
            {line.flags?.includes("tg") ? <span className="ml-2 t-label text-[var(--grey)]">TG</span> : null}
            {line.flags?.includes("wa") ? <span className="ml-2 t-label text-[var(--grey)]">WA</span> : null}
          </p>
        ))}
        {contact.note ? <p className={`m-0 t-body ${ROW}`}>{contact.note}</p> : null}
        {contact.eventTag ? <p className={`m-0 t-body ${ROW}`}>{contact.eventTag}</p> : null}
        {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
      </div>
      <div className="flex border-t border-[var(--rule)] pb-[max(0px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            void remove();
          }}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          {armed ? "Delete?" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (armed) {
              setArmed(false);
              return;
            }
            router.push(`/network/x/${contact.id}/edit`);
          }}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)]"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={swapped}
          onClick={() => setArmed(false)}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          Swap
        </button>
      </div>
    </main>
  );
}
