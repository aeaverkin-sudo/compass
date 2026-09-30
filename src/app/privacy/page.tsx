import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { BackButton } from "@/shared/components/back-button";
import { LegalDocument } from "@/shared/components/legal-document";
import { PRIVACY_VERSION } from "@/shared/services/consent";

export const metadata: Metadata = { title: "Privacy — ADED" };

export default function PrivacyPage() {
  const source = readFileSync(path.join(process.cwd(), "legal/privacy-policy.md"), "utf8");
  return (
    <main
      data-privacy-version={PRIVACY_VERSION}
      className="compass-main h-dvh overflow-y-auto bg-white px-[26px] pt-[84px] pb-16 text-[#111]"
    >
      <BackButton fallbackHref="/" />
      <LegalDocument source={source} />
    </main>
  );
}
