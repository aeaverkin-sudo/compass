import { notFound, redirect } from "next/navigation";
import { HANDLE_RE } from "@/shared/services/card-handle";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = { searchParams: Promise<{ token?: string; handle?: string }> };

/** The in-app scanner no longer opens this screen. Old links land on the public card. */
export default async function ScanCardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.token && TOKEN_RE.test(params.token)) redirect(`/c/${params.token}`);
  const handle = params.handle?.toLowerCase() ?? "";
  if (HANDLE_RE.test(handle)) redirect(`/@${handle}`);
  notFound();
}
