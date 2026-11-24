import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "node:zlib";
import {
  contactFileRefs,
  fileBelongsToOwner,
  optionalColumnToDrop,
  ownedAttachmentId,
  readAllPages,
  zipStored,
} from "./account-export-format.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("a file is exported only for its owner and only from that owner's path", () => {
  assert.equal(fileBelongsToOwner(OWNER, { owner_id: OWNER, storage_path: `${OWNER}/card/file` }), true);
  assert.equal(fileBelongsToOwner(OWNER, { owner_id: OTHER, storage_path: `${OWNER}/card/file` }), false);
  assert.equal(fileBelongsToOwner(OWNER, { owner_id: OWNER, storage_path: `${OTHER}/card/file` }), false);
});

test("a manual contact lists a packed file and omits anyone else's", () => {
  const packed = new Set(["mine"]);
  assert.deepEqual(
    contactFileRefs(
      OWNER,
      [
        { id: "mine", name: "Mine.pdf" },
        { id: "theirs", name: "Secret.pdf" },
        { id: "pending", name: "Waiting.pdf" },
      ],
      packed,
    ),
    [{ id: "mine", name: "Mine.pdf", included: true }],
  );
  assert.equal(ownedAttachmentId("mine", packed), "mine");
  assert.equal(ownedAttachmentId("theirs", packed), null);
  assert.equal(ownedAttachmentId("pending", packed), null);
});

test("a missing photo_attachment_id does not drop id", () => {
  const fields = ["id", "photo_attachment_id", "photo_look", "pushback_card_id"];
  const optional = ["photo_look", "handle", "pushback_card_id", "header_field"];
  assert.equal(
    optionalColumnToDrop('column "photo_attachment_id" of relation "cards" does not exist', fields, optional),
    null,
  );
  assert.equal(optionalColumnToDrop('column "pushback_card_id" does not exist', fields, optional), "pushback_card_id");
  assert.equal(
    optionalColumnToDrop("Could not find the 'photo_look' column of 'cards' in the schema cache", fields, optional),
    "photo_look",
  );
  assert.equal(optionalColumnToDrop('column "id" does not exist', fields, optional), null);
});

test("rows are read until a short page and a later page error fails the read", async () => {
  const seen: [number, number][] = [];
  const rows = await readAllPages(async (from, to) => {
    seen.push([from, to]);
    const all = [1, 2, 3, 4, 5].map((id) => ({ id }));
    return { data: all.slice(from, to + 1), error: null };
  }, 2);
  assert.deepEqual(seen, [
    [0, 1],
    [2, 3],
    [4, 5],
  ]);
  assert.equal(rows.length, 5);

  await assert.rejects(
    () =>
      readAllPages(async (from) => {
        if (from > 0) return { data: null, error: { message: "page failed" } };
        return { data: [{ id: "a" }, { id: "b" }], error: null };
      }, 2),
    /page failed/,
  );
});

test("the zip stores the readme and a file under their names", () => {
  const readme = new TextEncoder().encode("ADED account copy\n");
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const zip = zipStored([
    { name: "README.txt", data: readme },
    { name: "files/mine/Mine.pdf", data: pdf },
  ]);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  const found = namesAndBodies(zip);
  assert.deepEqual(
    found.map((file) => file.name),
    ["README.txt", "files/mine/Mine.pdf"],
  );
  assert.deepEqual(found[0]?.data, [...readme]);
  assert.deepEqual(found[1]?.data, [...pdf]);
  assert.equal(found[1]?.crc, crc32(pdf) >>> 0);
});

function namesAndBodies(zip: Uint8Array) {
  const files: { name: string; data: number[]; crc: number }[] = [];
  let offset = 0;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  while (offset + 30 <= zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extra;
    files.push({ name, data: [...zip.subarray(dataStart, dataStart + size)], crc });
    offset = dataStart + size;
  }
  return files;
}
