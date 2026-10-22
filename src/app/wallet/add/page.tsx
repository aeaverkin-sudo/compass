import { WalletAddScreen } from "./add-screen";

type PageProps = { searchParams: Promise<{ card?: string; e?: string; s?: string }> };

export default async function WalletAddPage({ searchParams }: PageProps) {
  const query = await searchParams;
  return <WalletAddScreen cardId={query.card ?? ""} expires={query.e ?? ""} signature={query.s ?? ""} />;
}
