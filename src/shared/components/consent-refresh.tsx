"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useAccountStatus } from "@/shared/hooks/use-account-status";
import { CONSENT_ACCEPTED_EVENT, CONSENT_VERSION, isOlderConsent } from "@/shared/services/consent";
import { recordConsent } from "@/shared/services/consent-client";

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
    if (busy) return;
    setAccepted(true);
    setBusy(true);
    setMessage(null);
    try {
      await recordConsent("register");
      window.dispatchEvent(new CustomEvent(CONSENT_ACCEPTED_EVENT, { detail: CONSENT_VERSION }));
      setDone(true);
    } catch (error) {
      setAccepted(false);
      setMessage(error instanceof Error ? error.message : "Could not save the agreement");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" />
      <div className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center">
        <p className="t-body text-[var(--ink)]">We&apos;ve updated our Terms and Privacy Policy.</p>
        <div className="mt-3 flex items-start justify-center gap-2 text-left">
          <Checkbox
            id="consent-refresh"
            checked={accepted}
            disabled={busy}
            onCheckedChange={(value) => {
              if (value === true) void save();
            }}
            aria-label="I agree to the updated Terms and Privacy Policy"
            className="mt-0.5 size-4 shrink-0 rounded-none border border-[var(--rule)] bg-white"
          />
          <p className="t-meta text-[var(--ink)]">
            <label htmlFor="consent-refresh">I agree to the updated</label>{" "}
            <Link href="/terms" className="text-[var(--ink)] underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-[var(--ink)] underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        {message ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{message}</p> : null}
      </div>
    </>
  );
}
