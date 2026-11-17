"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startGoogleSignIn } from "@/shared/components/social-sign-in-rows";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import { socialSignInBlocked } from "@/shared/lib/funnel";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { cancelOAuthReplaceLocal } from "@/shared/lib/session-bootstrap";
import { cn } from "@/lib/utils";

const ARROW_TIP_INSET_PX = 7.3;
const CHEVRON_PX = 22;

/** Continue with Google, under the Sign up / Sign in toggle. Hidden unless the switch is on, and hidden in browsers where Google refuses the sign-in. */
export function GoogleSignIn({
  from,
  next,
  divider,
  padded = false,
}: {
  from: "create" | "signin";
  next?: string | null;
  divider: string;
  /** The page already pads by the gutter, so only the chevron inset remains. */
  padded?: boolean;
}) {
  const enabled = process.env.NEXT_PUBLIC_SOCIAL_SIGNIN === "1";
  const [shown, setShown] = useState(false);

  useEffect(() => {
    cancelOAuthReplaceLocal();
  }, []);

  useEffect(() => {
    if (!enabled || socialSignInBlocked()) return;
    const id = window.setTimeout(() => setShown(true), 0);
    return () => window.clearTimeout(id);
  }, [enabled]);

  if (!shown) return null;

  const start = () => startGoogleSignIn(from, next);

  const inset = `calc(${padded ? "0px" : "var(--gutter)"} - ${ARROW_TIP_INSET_PX}px + ${CHEVRON_PX}px + ${COLUMN_GAP_PX}px)`;

  return (
    <div className="mb-[18px]" style={{ marginLeft: inset, marginRight: padded ? 0 : "var(--gutter)" }}>
      <button
        type="button"
        onClick={start}
        className={cn(
          "press w-full border-0 bg-white py-[10.8px] text-center t-caps text-[var(--ink)]",
          photoSlotLookClass("shadow"),
        )}
      >
        Continue with Google
      </button>
      <p className="mt-2 text-center t-meta text-[var(--grey)]">
        By continuing you agree to{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        .
      </p>
      <div className="mt-[18px] flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--rule)]" />
        <span className="t-meta whitespace-nowrap text-[var(--grey)]">{divider}</span>
        <span className="h-px flex-1 bg-[var(--rule)]" />
      </div>
    </div>
  );
}
