"use client";

import { useState } from "react";
import { ConsentLine } from "@/shared/components/consent-line";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { CONSENT_ACCEPTED_EVENT, CONSENT_VERSION } from "@/shared/services/consent";
import { recordConsent } from "@/shared/services/consent-client";

/**
 * Returning people who accepted an older text see this once, on the next entry.
 * New acceptance writes version 1.0. Terms and Privacy stay readable underneath via their own routes.
 */
export function ConsentRefresh() {
  const account = useAccountStatus();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done || !account || account.consentVersion === CONSENT_VERSION) return null;

  const save = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordConsent(account.registered ? "register" : "trial");
      window.dispatchEvent(new CustomEvent(CONSENT_ACCEPTED_EVENT, { detail: CONSENT_VERSION }));
      setDone(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the agreement");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <h1 className="text-[28px] leading-tight font-light">Updated terms</h1>
      <p className="mt-3 max-w-xs text-[15px] leading-[1.45] font-normal">
        The terms and the privacy policy are now version {CONSENT_VERSION}. Accept them to continue.
      </p>
      <div className="mt-6">
        <ConsentLine checked={accepted} onCheckedChange={setAccepted} id="consent-refresh" />
      </div>
      <button
        type="button"
        disabled={!accepted || busy}
        onClick={() => void save()}
        className="mt-2 self-start border-0 bg-sky px-6 py-3 text-[13px] font-normal tracking-[0.14em] uppercase disabled:opacity-40"
      >
        Continue
      </button>
      {message ? <p className="mt-4 max-w-xs text-[13px] leading-snug font-normal">{message}</p> : null}
    </div>
  );
}
