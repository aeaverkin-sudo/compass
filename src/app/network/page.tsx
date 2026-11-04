import { NetworkScreen } from "./network-screen";

type PageProps = { searchParams: Promise<{ added?: string }> };

export default async function NetworkPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const added = typeof params.added === "string" ? params.added : null;
  return <NetworkScreen addedName={added} />;
}
