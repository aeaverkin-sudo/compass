"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { recordConsent } from "@/shared/services/consent-client";
import { startTrialClock } from "@/shared/services/trial-client";

export function TrialGate({ onContinue }: { onContinue: () => void }) {
  const [terms, setTerms] = useState(false);
  const [deletion, setDeletion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = terms && deletion;

  const agree = (event: MouseEvent, toggle: () => void) => {
    if ((event.target as HTMLElement).closest("a")) return;
    toggle();
  };

  const continueTrial = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      await recordConsent("trial");
      await startTrialClock();
      onContinue();
    })().catch((reason: unknown) => {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Could not start the trial");
    });
  };

  return (
    <main className="compass-main flex h-dvh items-center justify-center overflow-y-auto bg-white px-[var(--gutter)] py-12 text-[var(--ink)]">
      <div className="w-full max-w-xs">
        <div className="bg-sky px-5 py-6">
          <p className="t-body">No-sign-up trial</p>
          <p className="mt-3 t-meta">
            You get 60 hours of full access — no sign-up. After that your profile freezes for 40 more hours so you can
            register and keep everything. If you don&apos;t register in time, your profile and all its data are deleted.
          </p>
        </div>
        <div className="mt-6 flex items-start gap-3">
          <Checkbox
            id="trial-terms"
            checked={terms}
            onCheckedChange={(value) => setTerms(value === true)}
            aria-label="I agree to the Terms and Conditions and Privacy Policy"
            className="mt-px"
          />
          <p className="t-meta" onClick={(event) => agree(event, () => setTerms((value) => !value))}>
            I agree to the{" "}
            <Link href="/terms" className="underline">
              Terms & Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
          </p>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <Checkbox
            id="trial-deletion"
            checked={deletion}
            onCheckedChange={(value) => setDeletion(value === true)}
            aria-label="I understand my profile is deleted if I don't register in time"
            className="mt-px"
          />
          <p className="t-meta" onClick={() => setDeletion((value) => !value)}>
            I understand my profile is deleted if I don&apos;t register in time
          </p>
        </div>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={continueTrial}
          className="press mt-6 w-full border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          Continue
        </button>
        {error ? <p className="mt-4 t-meta">{error}</p> : null}
      </div>
    </main>
  );
}
