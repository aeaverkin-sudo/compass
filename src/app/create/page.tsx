import type { Metadata } from "next";
import { SignupScreen } from "../e/[code]/create/signup-screen";
import { sourceCardToken } from "@/shared/services/source-card";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

type PageProps = { searchParams: Promise<{ card?: string | string[] }> };

/** Site sign-up with no portfolio yet. The same questionnaire as an event. */
export default async function CreateAccountPortfolioPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = Array.isArray(query.card) ? query.card[0] : query.card;
  return <SignupScreen account sourceToken={sourceCardToken(raw)} />;
}
