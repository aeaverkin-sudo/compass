import type { EventPassStatus } from "@/shared/services/trial";

/** Pass accounts are gone. Nothing is an event pass. */
export async function readEventPass(
  _userId: string,
  _mail: { keepByTap: boolean; email: string | null; pendingEmail: string | null },
): Promise<EventPassStatus | null> {
  void _userId;
  void _mail;
  return null;
}
