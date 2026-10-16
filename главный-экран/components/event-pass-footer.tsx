"use client";

import { useState } from "react";
import Link from "next/link";
import { KeepProfileButton } from "@/shared/components/keep-profile-button";
import { TapButton } from "@/shared/components/tap-button";
import { SkyToast } from "@/shared/components/sky-toast";
import { deletionLine } from "@/shared/lib/deletion-date";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { openWalletPass, WALLET_SOON } from "@/shared/lib/wallet-client";
import { useAppStore } from "@/shared/store/app-store";

const FIELD =
  "compass-input block w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 py-1 text-center t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";

/** A phone guest adds an email. Supabase sends the confirmation; the pass stays as it is until then. */
function AddEmail({ pendingEmail }: { pendingEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(pendingEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return <p className="mt-3 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">{`Check ${sent} to confirm it.`}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        data-card-content
        data-no-swipe
        onClick={() => setOpen(true)}
        className="mt-3 max-w-[260px] border-0 bg-transparent p-0 text-center t-meta text-[var(--grey)]"
      >
        Add your email to keep this pass on any device.
      </button>
    );
  }

  const submit = async () => {
    const value = email.trim().toLowerCase();
    if (busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Check the email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await createBrowserSupabaseClient().auth.updateUser(
      { email: value },
      { emailRedirectTo: `${window.location.origin}/main` },
    );
    setBusy(false);
    if (updateError) {
      setError(/already|exists|registered/i.test(updateError.message) ? "This email already has an ADED profile" : updateError.message);
      return;
    }
    setSent(value);
  };

  return (
    <form
      data-card-content
      data-no-swipe
      className="mt-3 flex w-full max-w-[260px] flex-col items-center"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        type="email"
        autoFocus
        autoCapitalize="none"
        autoComplete="email"
        aria-label="Email"
        placeholder="name@mail.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={FIELD}
      />
      {error ? <p className="mt-2 mb-0 text-center t-meta text-[var(--ink)]">{error}</p> : null}
    </form>
  );
}

/** Under the rows of a guest's event card: the scanner and Wallet before the end, or Keep after it. */
export function EventPassFooter({
  ended,
  payPending,
  deleteAt,
  needsEmail,
  pendingEmail,
}: {
  ended: boolean;
  payPending: boolean;
  deleteAt: string | null;
  needsEmail: boolean;
  pendingEmail: string | null;
}) {
  const [toast, setToast] = useState(false);
  const deletion = deletionLine(deleteAt);

  return (
    <div className="flex flex-col items-center">
      {needsEmail || pendingEmail ? <AddEmail pendingEmail={pendingEmail} /> : null}
      {ended ? (
        <>
          {deletion ? <p className="mt-6 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">{deletion}</p> : null}
          <div className="mt-3">
            <KeepProfileButton />
          </div>
        </>
      ) : (
        <>
          {payPending ? (
            <p className="mt-6 mb-0 inline-flex max-w-[260px] items-center gap-2 text-center t-meta text-[var(--grey)]">
              <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--pay-pending)]" />
              Payment pending — the organiser will confirm it.
            </p>
          ) : null}
          <div className={payPending ? "mt-3" : "mt-6"}>
            <Link
              href="/scan"
              data-card-content
              data-no-swipe
              className="press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] no-underline"
            >
              Scan a card
            </Link>
          </div>
          <p className="mt-3 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">Scan a guest&apos;s QR to keep their card.</p>
          <div className="mt-6">
            <TapButton
              data-card-content
              data-no-swipe
              onTap={() => {
                const { cards, currentCardIndex } = useAppStore.getState();
                const card = cards[currentCardIndex] ?? cards[0];
                if (!card) return setToast(true);
                void openWalletPass(`/api/cards/${card.id}/pass`).then((opened) => setToast(!opened));
              }}
              className="press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)]"
            >
              Add to Apple Wallet
            </TapButton>
          </div>
          <p className="mt-3 mb-0 max-w-[260px] text-center t-meta text-[var(--grey)]">
            This event pass is also your portfolio — share it with people you meet at the event.
          </p>
        </>
      )}
      {toast ? <SkyToast text={WALLET_SOON} onDone={() => setToast(false)} /> : null}
    </div>
  );
}
