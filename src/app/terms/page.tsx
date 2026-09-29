import type { Metadata } from "next";
import { LegalDraft } from "@/shared/components/legal-draft";

export const metadata: Metadata = { title: "Terms — ADED" };

export default function TermsPage() {
  return <LegalDraft title="Terms" />;
}
