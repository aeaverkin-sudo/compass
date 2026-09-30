"use client";

import { useEffect, useState } from "react";
import { CONSENT_ACCEPTED_EVENT } from "@/shared/services/consent";
import type { AccountStatus } from "@/shared/services/trial";

export function useAccountStatus() {
  const [status, setStatus] = useState<AccountStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AccountStatus;
      })
      .then((next) => {
        if (!cancelled && next) setStatus(next);
      })
      .catch(() => undefined);
    const onAccepted = (event: Event) => {
      const version = (event as CustomEvent<string>).detail;
      if (typeof version !== "string") return;
      setStatus((current) => (current ? { ...current, consentVersion: version } : current));
    };
    window.addEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
    return () => {
      cancelled = true;
      window.removeEventListener(CONSENT_ACCEPTED_EVENT, onAccepted);
    };
  }, []);

  return status;
}
