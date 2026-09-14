import { ShareView } from "@/features/exchange/components/share-view";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { token } = await params;
  const { print } = await searchParams;
  return <ShareView token={token} printMode={print === "1"} />;
}
