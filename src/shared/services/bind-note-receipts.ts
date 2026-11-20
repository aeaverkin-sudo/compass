import { readGuestClaimId } from "@/shared/services/note-guest-claim";
import { bindGuestReceipts } from "@/shared/services/note-receipts";

/** After Connect / sign-in: attach this browser's open receipts to the account. */
export async function bindSessionReceipts(userId: string): Promise<void> {
  try {
    const guestClaimId = await readGuestClaimId();
    await bindGuestReceipts(userId, guestClaimId);
  } catch (reason) {
    console.error("[notes] bind session", reason);
  }
}
