const PRIVATE = { "Cache-Control": "private, no-store" };

/** Zip response for one signed-in owner. A failure before the first byte stays JSON. */
export async function streamAccountExport(
  owner: { ok: true; id: string } | { ok: false; status: number },
  open: (ownerId: string) => AsyncGenerator<Uint8Array>,
): Promise<Response> {
  if (!owner.ok) {
    return Response.json({ error: "Sign in to download your data." }, { status: owner.status, headers: PRIVATE });
  }

  const parts = open(owner.id);
  let first: IteratorResult<Uint8Array>;
  try {
    first = await parts.next();
  } catch (error) {
    console.error("[account] export", error instanceof Error ? error.message : "failed");
    return Response.json(
      { error: "Could not download your data. Try again." },
      { status: 500, headers: PRIVATE },
    );
  }
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = started ? await parts.next() : first;
        started = true;
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        console.error("[account] export", error instanceof Error ? error.message : "failed");
        controller.error(new Error("Could not download your data."));
      }
    },
    cancel() {
      void parts.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      ...PRIVATE,
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="aded-account.zip"',
    },
  });
}
