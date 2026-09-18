import { NextResponse } from "next/server";
import { getShare } from "@/shared/lib/share-store";
import { cardPdfFilename, generateCardPdf } from "@/shared/services/card-pdf";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const entry = getShare(token);

  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdfBytes = await generateCardPdf(entry.snapshot);
  const filename = cardPdfFilename(entry.snapshot);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
