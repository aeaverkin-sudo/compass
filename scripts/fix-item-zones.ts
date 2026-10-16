/**
 * One-off: rebuild cards.item_zones from each row's type and text.
 * Dry-run by default. Pass --apply to write.
 *
 *   npx tsx scripts/fix-item-zones.ts
 *   npx tsx scripts/fix-item-zones.ts --apply
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminSupabaseClient } from "../src/shared/lib/supabase/admin";
import {
  CARD_ZONES,
  isCardZoneId,
  normalizeItemZones,
  normalizeRubricLabels,
  withItemZone,
  zoneForItem,
  zoneTitle,
  type CardZoneId,
} from "../src/shared/services/card-zones";
import type { ContactItem, ContactType } from "../src/shared/types";

type CardRow = {
  id: string;
  owner_id: string;
  display_name: string | null;
  handle: string | null;
  item_zones: unknown;
  rubric_labels: unknown;
};

type ItemRow = {
  id: string;
  type: string;
  label: string | null;
  value: string | null;
  url: string | null;
  attachment_id: string | null;
};

type LinkRow = {
  card_id: string;
  item_id: string;
};

type Change = {
  card: string;
  line: string;
  from: string;
  to: string;
  skip?: string;
};

function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const admin = createAdminSupabaseClient();
  const page = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

function asItem(row: ItemRow): ContactItem {
  return {
    id: row.id,
    type: row.type as ContactType,
    label: row.label ?? "",
    value: row.value ?? "",
    url: row.url ?? "",
    attachmentId: row.attachment_id ?? undefined,
    order: 0,
  };
}

function heading(zoneId: string, labels: Record<string, string> | undefined) {
  const zone = CARD_ZONES.find((entry) => entry.id === zoneId);
  return zoneTitle({ rubricLabels: labels }, zoneId, zone?.title ?? zoneId);
}

function preview(item: ContactItem) {
  const text = (item.value || item.label).replace(/\s+/g, " ").trim();
  if (item.type === "email" || /@/.test(text)) return "(email)";
  if (item.type === "phone" || item.type === "whatsapp") return "(phone)";
  if (!text) return `(${item.type})`;
  return text.length > 64 ? `${text.slice(0, 63)}…` : text;
}

function cardLabel(card: CardRow, index: number) {
  const handle = card.handle?.trim();
  if (handle) return `@${handle}`;
  return `card ${index + 1}`;
}

function sameZones(a: Record<string, string> | undefined, b: Record<string, string> | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const cards = await fetchAll<CardRow>(
    "cards",
    "id, owner_id, display_name, handle, item_zones, rubric_labels",
  );
  const items = await fetchAll<ItemRow>("items", "id, type, label, value, url, attachment_id");
  const links = await fetchAll<LinkRow>("card_items", "card_id, item_id");
  const byItem = new Map(items.map((row) => [row.id, row]));
  const onCard = new Map<string, string[]>();
  for (const link of links) {
    const list = onCard.get(link.card_id) ?? [];
    list.push(link.item_id);
    onCard.set(link.card_id, list);
  }

  const changes: Change[] = [];
  const writes: { id: string; item_zones: Record<string, string> | null }[] = [];
  let keptLooking = 0;

  cards.forEach((card, index) => {
    const labels = normalizeRubricLabels(card.rubric_labels);
    const stored = normalizeItemZones(card.item_zones);
    const storedMap = stored ?? {};
    const ids = onCard.get(card.id) ?? [];
    let next: Record<string, string> | undefined;
    const name = cardLabel(card, index);

    for (const itemId of ids) {
      const row = byItem.get(itemId);
      if (!row) continue;
      const item = asItem(row);
      const natural = zoneForItem(item);
      const currentStored = storedMap[itemId];
      const current: CardZoneId =
        currentStored && isCardZoneId(currentStored) ? currentStored : natural;
      const lookingFor = labels?.background === "Looking for" && current === "background";
      if (lookingFor) {
        next = withItemZone({ itemZones: next }, item, "background");
        keptLooking += 1;
        continue;
      }
      next = withItemZone({ itemZones: next }, item, natural);
      if (current !== natural) {
        changes.push({
          card: name,
          line: preview(item),
          from: heading(current, labels),
          to: heading(natural, labels),
        });
      }
    }

    for (const itemId of Object.keys(storedMap)) {
      if (ids.includes(itemId)) continue;
      const row = byItem.get(itemId);
      changes.push({
        card: name,
        line: row ? preview(asItem(row)) : "(removed row)",
        from: heading(storedMap[itemId] ?? "", labels),
        to: "—",
      });
    }

    if (!sameZones(stored, next)) {
      writes.push({ id: card.id, item_zones: next ?? null });
      const storedNames = Object.values(storedMap).map((zone) => heading(zone, labels));
      const nextNames = Object.values(next ?? {}).map((zone) => heading(zone, labels));
      changes.push({
        card: name,
        line: `(normalize ${storedNames.join(", ") || "empty"} → ${nextNames.join(", ") || "natural"})`,
        from: `${Object.keys(storedMap).length} keys`,
        to: `${Object.keys(next ?? {}).length} keys`,
      });
    }
  });

  console.log(apply ? "APPLY" : "DRY RUN — nothing written");
  console.log(`cards ${cards.length}  items ${items.length}  links ${links.length}`);
  console.log(`rows ${changes.length}  cards to update ${writes.length}  looking-for kept ${keptLooking}`);
  if (changes.length > 0) {
    console.log("");
    console.log(
      `${"card".padEnd(20)}${"from".padEnd(16)}${"to".padEnd(16)}line`,
    );
    for (const row of changes) {
      console.log(`${row.card.padEnd(20)}${row.from.padEnd(16)}${row.to.padEnd(16)}${row.line}`);
    }
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write item_zones.");
    return;
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  for (const write of writes) {
    const { error } = await admin
      .from("cards")
      .update({ item_zones: write.item_zones, updated_at: now })
      .eq("id", write.id);
    if (error) throw new Error(`card ${write.id}: ${error.message}`);
  }
  console.log(`wrote ${writes.length} cards`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
