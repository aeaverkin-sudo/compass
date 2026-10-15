"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { getSessionBootstrapReady, subscribeSessionBootstrap } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { hydrateCardsFromServer } from "@/shared/services/card-sync";
import { clearLocal } from "../../../e/[code]/invite-actions";

const EXPIRED = "This link has expired. Enter your email again.";

export function AddByEmail({
  token,
  name,
  hash,
  kind,
}: {
  token: string;
  name: string;
  hash: string;
  kind: "magiclink" | "invite";
}) {
  const router = useRouter();
  const savePath = `/save/${encodeURIComponent(token)}`;
  const cardPath = `/c/${encodeURIComponent(token)}`;
  const ready = useSyncExternalStore(subscribeSessionBootstrap, getSessionBootstrapReady, () => false);
  const ran = useRef(false);
  const [opening, setOpening] = useState(Boolean(hash));
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hash || !ready || ran.current) return;
    ran.current = true;
    void (async () => {
      clearLocal();
      const signed = await createBrowserSupabaseClient().auth.verifyOtp({ token_hash: hash, type: kind });
      if (signed.error) {
        setOpening(false);
        setMessage(EXPIRED);
        return;
      }
      await hydrateCardsFromServer();
      router.replace(savePath);
    })();
  }, [hash, kind, ready, router, savePath]);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/save-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not send the link");
        return;
      }
      setSentTo(email.trim());
    } catch {
      setMessage("Could not send the link");
    } finally {
      setBusy(false);
    }
  };

  if (opening) {
    return (
      <main className="compass-main flex h-dvh w-full items-center justify-center bg-white px-[var(--gutter)] text-[var(--ink)]">
        <p className="m-0 text-center t-meta text-[var(--grey)]">Adding {name} to your network…</p>
      </main>
    );
  }

  return (
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[var(--ink)]">
      <ScreenHeader title="Add to My Network" fallbackHref={cardPath} />
      <div style={{ paddingLeft: VALUE_AXIS_PX }}>
        <p className="mt-3 max-w-xs t-meta">
          {sentTo
            ? `Check ${sentTo}. Open the link in the email to add ${name}.`
            : `Enter your email. We'll send a link that adds ${name} to your network. No password needed.`}
        </p>
        {sentTo ? null : (
          <form
            className="mt-8 flex max-w-xs flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="t-label" htmlFor="save-email">
              Email
            </label>
            <input
              id="save-email"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 border-b border-[var(--rule)] bg-transparent py-2 t-body outline-none"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="mt-6 self-start border-0 bg-sky px-6 py-3 t-caps disabled:opacity-40"
            >
              Send link
            </button>
          </form>
        )}
        {message ? <p className="mt-6 max-w-xs t-meta">{message}</p> : null}
        <div className="mt-10 flex max-w-xs flex-col gap-3 t-meta text-[var(--grey)]">
          <Link href={cardPath} className="underline">
            Back to the card to save a PDF
          </Link>
          <Link href={`/register?signin=1&next=${encodeURIComponent(savePath)}`} className="underline">
            Sign in with password
          </Link>
        </div>
      </div>
    </main>
  );
}
