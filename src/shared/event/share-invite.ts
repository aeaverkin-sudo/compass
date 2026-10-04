/** Hand the invite to the system share sheet, or copy it when that sheet is not there. */
export async function shareInviteLink(
  payload: { title: string; url: string },
  env: {
    share?: (data: { title: string; url: string }) => Promise<void>;
    writeText: (url: string) => Promise<void>;
  },
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (env.share) {
    try {
      await env.share({ title: payload.title, url: payload.url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await env.writeText(payload.url);
    return "copied";
  } catch {
    return "failed";
  }
}
