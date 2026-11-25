import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import {
  PRODUCT_COUNTS_ENABLED,
  objectedFromQuery,
  productCountBumpArgs,
  productCountCutoff,
  productCountDay,
  type CountAction,
} from "@/shared/services/product-stats";

function missingStats(message: string): boolean {
  return (
    /bump_product_count|object_to_product_counts|product_daily_counts|product_count_objections/i.test(message) &&
    /schema cache|does not exist|could not find/i.test(message)
  );
}

/**
 * Records one action once collection is on. The database checks an objection and increments in one statement.
 * A failure, or a table that is not created yet, never blocks the registration, save, share, or open.
 * Objection works while this is off, so Privacy can ship before any total is written.
 */
export async function noteProductCount(input: {
  action: CountAction;
  cardId?: string | null;
  ownerId?: string | null;
  now?: Date;
}): Promise<void> {
  if (!PRODUCT_COUNTS_ENABLED) return;
  const args = productCountBumpArgs(input);
  if (!args) return;
  try {
    const admin = createAdminSupabaseClient();
    const wrote = await admin.rpc("bump_product_count", args);
    if (wrote.error && !missingStats(wrote.error.message)) console.error("[product-count]");
  } catch {
    console.error("[product-count]");
  }
}

/** True when this account already asked to stop totals linked to it. A read error is not "no objection". */
export async function productCountsObjected(ownerId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const row = await admin.from("product_count_objections").select("owner_id").eq("owner_id", ownerId).maybeSingle();
  return objectedFromQuery(row);
}

/**
 * Saves the objection, deletes totals linked to this account, and later bumps do not add new ones.
 * Throws when the mark cannot be saved, so the request is not reported as done.
 */
export async function objectToProductCounts(ownerId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const saved = await admin.rpc("object_to_product_counts", { p_owner_id: ownerId });
  if (saved.error) throw new Error(saved.error.message);
}

/** Deletes daily totals older than 90 days. A table that is not created yet is left alone. */
export async function purgeProductCounts(now = new Date()): Promise<number> {
  try {
    const admin = createAdminSupabaseClient();
    const cutoff = productCountCutoff(productCountDay(now));
    const removed = await admin.from("product_daily_counts").delete({ count: "exact" }).lt("day", cutoff);
    if (removed.error) {
      if (missingStats(removed.error.message)) return 0;
      throw new Error(removed.error.message);
    }
    return removed.count ?? 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingStats(message)) return 0;
    throw error;
  }
}
