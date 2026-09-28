"use client";

import { useEffect, useState } from "react";
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
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
