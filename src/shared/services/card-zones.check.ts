import assert from "node:assert/strict";
import type { ContactItem, ContactType } from "@/shared/types";
import { composeCard, groupLibrary, parseDescription } from "./card-zones";

function item(id: string, type: ContactType, value: string, extra: Partial<ContactItem> = {}): ContactItem {
  return {
    id,
    type,
    label: "",
    value,
    url: type === "text" || type === "position" ? "" : `https://example.com/${id}`,
    order: 0,
    ...extra,
  };
}

const founder = parseDescription("Founder and CEO of Compass");
assert.equal(founder.position?.title, "Founder & CEO");
assert.equal(founder.position?.company, "Compass");
assert.deepEqual(founder.remainders, []);

const angel = parseDescription("angel investor, ex-product at HSE");
assert.equal(angel.position?.title, "Angel Investor");
assert.equal(angel.position?.company, undefined);
assert.deepEqual(angel.remainders, ["ex-Product @ HSE"]);

const none = parseDescription("pre-seed, raising round");
assert.equal(none.position, null);

const plain = composeCard([item("t", "text", "hello from berlin")]);
assert.equal(plain.position, null);
assert.deepEqual(
  plain.zones.map((zone) => zone.id),
  ["additional"],
);
assert.equal(plain.zones[0]?.rows[0]?.value, "hello from berlin");

const sites = composeCard([
  item("a", "website", "https://a.com"),
  item("b", "link", "https://b.com"),
  item("c", "website", "https://c.com"),
]);
assert.deepEqual(
  sites.zones.map((zone) => zone.id),
  ["web"],
);
assert.equal(sites.zones[0]?.rows.length, 3);
assert.ok(sites.zones[0]?.rows.every((row) => row.axis === ""));

const social = composeCard([
  item("i1", "instagram", "@one"),
  item("i2", "instagram", "@two"),
  item("y", "youtube", "channel"),
  item("t", "telegram", "chat"),
]);
assert.deepEqual(
  social.zones.map((zone) => zone.id),
  ["social"],
);
assert.deepEqual(
  social.zones[0]?.rows.map((row) => row.axis),
  ["Instagram", "Instagram", "YouTube", "Telegram"],
);

const files = composeCard([
  item("p", "pdf", "Deck.pdf", { label: "Deck" }),
  item("s", "instagram", "@one"),
]);
assert.deepEqual(
  files.zones.map((zone) => zone.id),
  ["social", "files"],
);
assert.equal(files.zones.find((zone) => zone.id === "files")?.rows[0]?.axis, "PDF");

const noFiles = composeCard([item("s", "instagram", "@one")]);
assert.ok(!noFiles.zones.some((zone) => zone.id === "files"));

const bio = composeCard([item("d", "text", "Founder and CEO of Compass")]);
assert.equal(bio.position, null);
assert.equal(bio.zones[0]?.rows[0]?.value, "Founder and CEO of Compass");

const mixed = composeCard([
  item("d", "text", "angel investor, ex-product at HSE"),
  item("w", "website", "https://compass.com"),
]);
assert.equal(mixed.position, null);
assert.deepEqual(
  mixed.zones.map((zone) => zone.id),
  ["position", "web"],
);
assert.equal(mixed.zones[0]?.rows[0]?.value, "angel investor, ex-product at HSE");

const explicit = composeCard([
  item("p", "position", "Founder"),
  item("d", "text", "likes jazz"),
]);
assert.equal(explicit.position, null);
assert.equal(explicit.zones.find((zone) => zone.id === "position")?.rows[0]?.value, "Founder");
assert.equal(explicit.zones.find((zone) => zone.id === "additional")?.rows[0]?.value, "likes jazz");

const partner = parseDescription("Managing Partner at North");
assert.equal(partner.position?.title, "Managing Partner");
assert.equal(partner.position?.company, "North");

const officer = parseDescription("chief executive officer of Compass");
assert.equal(officer.position?.title, "CEO");
assert.equal(officer.position?.company, "Compass");

const library = groupLibrary([
  item("w", "website", "https://a.com"),
  item("i", "instagram", "@one"),
  item("f", "pdf", "Deck.pdf"),
  item("s", "spotify", "playlist"),
  item("e", "email", "a@b.co"),
]);
assert.deepEqual(
  library.map((zone) => zone.id),
  ["web", "social", "files", "lifestyle", "contact"],
);

console.log("card-zones ok");
