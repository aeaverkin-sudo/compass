import type { Metadata } from "next";
import { LegalDraft } from "@/shared/components/legal-draft";

export const metadata: Metadata = { title: "Privacy — ADED" };

export default function PrivacyPage() {
  return <LegalDraft title="Privacy" />;
}
