"use client";

import { useState } from "react";
import { ConsentLine } from "@/shared/components/consent-line";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { CONSENT_ACCEPTED_EVENT, CONSENT_VERSION } from "@/shared/services/consent";
import { recordConsent } from "@/shared/services/consent-client";

function versionParts(value: string) {
  return value.split(".").map((part) => Number(part));
}

/** A stored acceptance is older only when every part parses and one is behind the current text. */
function isOlderConsent(stored: string | null, current: string) {
  if (!stored) return false;
  const left = versionParts(stored);
  const right = versionParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const earlier = left[index] ?? 0;
    const later = right[index] ?? 0;
    if (!Number.isFinite(earlier) || !Number.isFinite(later)) return false;
    if (earlier < later) return true;
    if (earlier > later) return false;
  }
  return false;
}

/**
 * A registered profile that already accepted an older text sees this once, on the next entry.
 * A missing consent row is a first visit: the landing checkbox handles that.
 */
export function ConsentRefresh() {
  const account = useAccountStatus();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const needsRefresh = Boolean(
    account?.registered && isOlderConsent(account.consentVersion, CONSENT_VERSION),
  );
  if (done || !needsRefresh || !account) return null;

  const save = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordConsent("register");
      window.dispatchEvent(new CustomEvent(CONSENT_ACCEPTED_EVENT, { detail: CONSENT_VERSION }));
      setDone(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the agreement");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-white px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[#111]">
      <h1 className="t-name">Updated terms</h1>
      <p className="mt-3 max-w-xs t-body">
        The terms and the privacy policy are now version {CONSENT_VERSION}. Accept them to continue.
      </p>
      <div className="mt-6">
        <ConsentLine checked={accepted} onCheckedChange={setAccepted} id="consent-refresh" />
      </div>
      <button
        type="button"
        disabled={!accepted || busy}
        onClick={() => void save()}
        className="mt-2 self-start border-0 bg-sky px-6 py-3 t-caps disabled:opacity-40"
      >
        Continue
      </button>
      {message ? <p className="mt-4 max-w-xs t-meta">{message}</p> : null}
    </div>
  );
}
