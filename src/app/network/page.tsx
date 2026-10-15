import { NetworkScreen } from "./network-screen";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

type PageProps = { searchParams: Promise<{ added?: string; from?: string }> };

export default async function NetworkPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const added = typeof params.added === "string" ? params.added : null;
  const from = typeof params.from === "string" && TOKEN_RE.test(params.from) ? params.from : null;
  return <NetworkScreen addedName={added} addedToken={added ? from : null} />;
}
