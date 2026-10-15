import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { AddByEmail } from "./add-by-email";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ h?: string | string[]; k?: string | string[] }>;
};

/** Add to My Network without a session: an email link, never a password wall. */
export default async function AddByEmailPage({ params, searchParams }: PageProps) {
  const { publicToken } = await params;
  if (!TOKEN_RE.test(publicToken)) notFound();
  const card = await createAdminSupabaseClient()
    .from("cards")
    .select("display_name")
    .eq("public_token", publicToken)
    .maybeSingle();
  if (card.error) throw new Error(card.error.message);
  if (!card.data) notFound();

  const query = await searchParams;
  const hash = typeof query.h === "string" ? query.h : "";
  const kind = query.k === "invite" ? "invite" : "magiclink";
  const name = ((card.data.display_name as string | null) ?? "").replace(/\s+/g, " ").trim() || "this card";
  return <AddByEmail token={publicToken} name={name} hash={hash} kind={kind} />;
}
