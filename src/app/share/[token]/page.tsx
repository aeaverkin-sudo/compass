import { SharePdfPage } from "./share-pdf-page";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { token } = await params;
  const { pdf } = await searchParams;

  return <SharePdfPage token={token} pdfMode={pdf === "1"} />;
}
