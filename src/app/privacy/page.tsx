import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { BackButton } from "@/shared/components/back-button";
import { LegalDocument } from "@/shared/components/legal-document";
import { HEADER_ROW_PX } from "@/shared/layout/axes";
import { PRIVACY_VERSION } from "@/shared/services/consent";
import { SCREEN_TOP_AXIS_PX } from "@main/layout";

export const metadata: Metadata = { title: "Privacy — ADED", robots: { index: false } };

export default function PrivacyPage() {
  const source = readFileSync(path.join(process.cwd(), "legal/privacy-policy.md"), "utf8");
  return (
    <main
      data-privacy-version={PRIVACY_VERSION}
      className="compass-main h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-16 text-[#111]"
      style={{
        paddingTop: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - ${HEADER_ROW_PX / 2}px + ${HEADER_ROW_PX}px + 30px)`,
      }}
    >
      <BackButton fallbackHref="/" />
      <LegalDocument source={source} />
    </main>
  );
}
