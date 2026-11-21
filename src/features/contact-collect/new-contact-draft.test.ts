import assert from "node:assert/strict";
import test from "node:test";
import {
  clearContactDraft,
  contactDraftIsEmpty,
  contactDraftKey,
  parseContactDraft,
  readContactDraft,
  writeContactDraft,
  type ContactDraftRecord,
} from "./new-contact-draft.ts";

const ADA = "11111111-1111-4111-8111-111111111111";
const GRACE = "22222222-2222-4222-8222-222222222222";

function emptyDraft(): ContactDraftRecord {
  return {
    name: "",
    position: "",
    company: "",
    headerField: null,
    note: "",
    lines: [],
    photo: null,
    source: "manual",
  };
}

function installStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => {
        map.set(key, String(value));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    },
  });
  return map;
}

test("one filled field without a name is a draft, and a cleared form is not", () => {
  const note = { ...emptyDraft(), note: "met at the door" };
  assert.equal(contactDraftIsEmpty(note), false);
  assert.equal(contactDraftIsEmpty({ ...emptyDraft(), photo: "data:image/jpeg;base64,aa" }), false);
  assert.equal(contactDraftIsEmpty({ ...emptyDraft(), source: "voice", headerField: null }), true);
  assert.equal(contactDraftIsEmpty({ ...emptyDraft(), name: "\n", lines: [{ value: "  ", flags: [] }] }), true);
});

test("a draft keeps the newline, line order, and marks, and stays on its account", () => {
  const map = installStorage();
  const photo = "data:image/jpeg;base64,abc";
  const draft: ContactDraftRecord = {
    name: "Anton\nAverkin",
    position: "Designer",
    company: "ADED",
    headerField: "position",
    note: "door",
    lines: [
      { value: "+1 202 555 0147", flags: ["wa", "tg"] },
      { value: "@anton", flags: [] },
    ],
    photo,
    source: "voice",
  };
  writeContactDraft(ADA, draft);
  writeContactDraft(GRACE, { ...emptyDraft(), company: "Other" });
  assert.deepEqual(readContactDraft(ADA), draft);
  assert.equal(readContactDraft(GRACE)?.company, "Other");
  assert.equal(map.has(contactDraftKey(ADA)), true);
  assert.equal(parseContactDraft(map.get(contactDraftKey(ADA))!)?.name, "Anton\nAverkin");
  clearContactDraft(ADA);
  assert.equal(readContactDraft(ADA), null);
  assert.equal(readContactDraft(GRACE)?.company, "Other");
});

test("text and lines past the save limits come back whole", () => {
  installStorage();
  const line = "L".repeat(301);
  const draft: ContactDraftRecord = {
    ...emptyDraft(),
    name: `${"N".repeat(121)}\n${"N".repeat(121)}`,
    position: "P".repeat(161),
    company: "C".repeat(161),
    headerField: "company",
    note: "n".repeat(501),
    lines: Array.from({ length: 31 }, (_, index) => ({
      value: index === 0 ? line : `row-${index}`,
      flags: index === 1 ? ["wa"] : [],
    })),
  };
  writeContactDraft(ADA, draft);
  assert.deepEqual(readContactDraft(ADA), draft);
});

test("a broken record is dropped, and a bad photo does not drop the text", () => {
  installStorage();
  globalThis.localStorage.setItem(contactDraftKey(ADA), "{");
  assert.equal(readContactDraft(ADA), null);
  assert.equal(globalThis.localStorage.getItem(contactDraftKey(ADA)), null);
  writeContactDraft(ADA, { ...emptyDraft(), note: "kept", photo: "data:image/jpeg;base64,abc" });
  const raw = globalThis.localStorage.getItem(contactDraftKey(ADA))!;
  const broken = JSON.parse(raw) as { photo: string };
  broken.photo = "not-a-photo";
  globalThis.localStorage.setItem(contactDraftKey(ADA), JSON.stringify(broken));
  const read = readContactDraft(ADA);
  assert.equal(read?.note, "kept");
  assert.equal(read?.photo, null);
});
