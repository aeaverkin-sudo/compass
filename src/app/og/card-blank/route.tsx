import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const SIZE = 256;

/** The link preview of a card without a photo: the empty square. */
export function GET() {
  return new ImageResponse(<div style={{ width: SIZE, height: SIZE, background: "#f3f3f3" }} />, {
    width: SIZE,
    height: SIZE,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
