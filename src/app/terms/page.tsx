import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { BackButton } from "@/shared/components/back-button";
import { LegalDocument } from "@/shared/components/legal-document";
import { TERMS_VERSION } from "@/shared/services/consent";

export const metadata: Metadata = { title: "Terms — ADED" };

export default function TermsPage() {
  const source = readFileSync(path.join(process.cwd(), "legal/terms-and-conditions.md"), "utf8");
  return (
    <main
      data-terms-version={TERMS_VERSION}
      className="compass-main h-dvh overflow-y-auto bg-white px-[26px] pt-[84px] pb-16 text-[#111]"
    >
      <BackButton fallbackHref="/" />
      <LegalDocument source={source} />
    </main>
  );
}
