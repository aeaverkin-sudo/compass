import { NextResponse } from "next/server";
import { cardPdfFilename } from "@/shared/services/card-pdf-name";
import { generateInactiveCardPdf } from "@/shared/services/card-pdf";
import { loadPublicCard } from "@/shared/services/public-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ publicToken: string }> };

function jsonFail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A live card PDF is painted in the browser from the same `/c/` card.
 * This route only still answers for a frozen trial.
 */
export async function GET(request: Request, context: RouteProps) {
  return POST(new Request(request.url, { method: "POST", headers: request.headers, body: "{}" }), context);
}

export async function POST(_request: Request, context: RouteProps) {
  const { publicToken } = await context.params;

  let loaded;
  try {
    loaded = await loadPublicCard(publicToken);
  } catch {
    return jsonFail(500, "Could not read the card");
  }
  if (!loaded) return jsonFail(404, "Not found");
  if (!loaded.inactive) return jsonFail(404, "Not found");

  const bytes = await generateInactiveCardPdf();
  const filename = cardPdfFilename("portfolio-inactive");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
