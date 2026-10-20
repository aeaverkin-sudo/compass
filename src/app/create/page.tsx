import type { Metadata } from "next";
import { OpenPortfolio } from "../e/[code]/create/open-questionnaire";

export const metadata: Metadata = { title: "Create a portfolio", robots: { index: false } };

/** Site sign-up with no portfolio yet. The same questionnaire as an event. */
export default function CreateAccountPortfolioPage() {
  return <OpenPortfolio account />;
}
