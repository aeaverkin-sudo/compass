"use client";

import { OpenPortfolio } from "./open-questionnaire";

/** One questionnaire for the open link and a personal invite. */
export function CreatePortfolio({
  lookup,
  hash,
  guest,
}: {
  lookup: string;
  hash: string;
  guest: { token: string; name: string; email: string } | null;
}) {
  return <OpenPortfolio lookup={lookup} hash={hash} guest={guest} />;
}
