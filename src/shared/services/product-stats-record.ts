import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  bumpProductCount,
  productCountCutoff,
  productCountDay,
  type CountAction,
  type CountClient,
  type CountError,
} from "@/shared/services/product-stats";

function missingTable(error: CountError): boolean {
  const message = error.message ?? "";
  return /product_daily_counts/i.test(message) && /schema cache|does not exist|could not find/i.test(message);
}

/** Records one action. A failure never blocks the registration, save, share, or open. */
export async function noteProductCount(input: {
  action: CountAction;
  cardId?: string | null;
  ownerId?: string | null;
  now?: Date;
}): Promise<void> {
  try {
    await bumpProductCount(createAdminSupabaseClient() as unknown as CountClient, {
      day: productCountDay(input.now),
      action: input.action,
      cardId: input.cardId,
      ownerId: input.ownerId,
    });
  } catch {
    console.error("[product-count]");
  }
}

/** Deletes daily totals older than 90 days. A table that is not created yet is left alone. */
export async function purgeProductCounts(now = new Date()): Promise<number> {
  try {
    const admin = createAdminSupabaseClient();
    const cutoff = productCountCutoff(productCountDay(now));
    const removed = await admin.from("product_daily_counts").delete({ count: "exact" }).lt("day", cutoff);
    if (removed.error) {
      if (missingTable(removed.error)) return 0;
      throw new Error(removed.error.message);
    }
    return removed.count ?? 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingTable({ message })) return 0;
    throw error;
  }
}
