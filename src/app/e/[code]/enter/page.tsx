import type { Metadata } from "next";
import { EnterPass } from "./enter-pass";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your pass", robots: { index: false } };

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string | string[]; pay?: string | string[] }>;
};

/** The sign-in link from the pass mail. The browser uses it once, then the pass opens. */
export default async function EnterPassPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
  const tokenHash = Array.isArray(query.t) ? query.t[0] : query.t;
  const pay = (Array.isArray(query.pay) ? query.pay[0] : query.pay) === "1";
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  return <EnterPass lookup={lookup} tokenHash={tokenHash ?? ""} pay={pay} />;
}
