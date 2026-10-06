/** Starts the 60h clock. Called from the no-sign-up gate, never from anonymous sign-in. */
export async function startTrialClock() {
  const response = await fetch("/api/account/trial", { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not start the trial");
  }
}
