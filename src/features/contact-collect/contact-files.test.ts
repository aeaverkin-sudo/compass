import assert from "node:assert/strict";
import test from "node:test";
import {
  contactFilePath,
  contactFileReadable,
  extraKeyMode,
  fileIdsOf,
  keptContactAttachmentIds,
} from "./contact-files.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const CONTACT = "22222222-2222-4222-8222-222222222222";
const PDF = "33333333-3333-4333-8333-333333333333";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const LOOSE = "55555555-5555-4555-8555-555555555555";
const BUCKET = "contact-files";

test("an old save without the new keys leaves extras untouched", () => {
  assert.equal(extraKeyMode({ displayName: "Ada" }), "omit");
  assert.equal(extraKeyMode({ about: "met at the door" }), "omit");
  assert.equal(extraKeyMode({ web: [] }), "partial");
  assert.equal(extraKeyMode({ about: "", web: [] }), "partial");
  assert.equal(extraKeyMode({ web: [], social: [], files: [] }), "present");
  assert.equal(extraKeyMode({ web: [], social: [], about: "", files: [] }), "present");
});

test("purge keeps a contact photo and a linked pdf, and drops an unlinked file", () => {
  const kept = keptContactAttachmentIds([PDF, PHOTO, LOOSE], [PHOTO], fileIdsOf([{ id: PDF, name: "a.pdf" }]));
  assert.deepEqual(kept.sort(), [PDF, PHOTO].sort());
  assert.equal(kept.includes(LOOSE), false);
});

test("the contact route refuses a stranger, a wrong bucket, and a link that is gone", () => {
  const path = contactFilePath(OWNER, CONTACT, PDF);
  const ready = {
    viewerId: OWNER,
    ownerId: OWNER,
    linked: true,
    status: "ready",
    bucket: BUCKET,
    bucketName: BUCKET,
    path,
    expectedPath: path,
  };
  assert.equal(contactFileReadable(ready), true);
  assert.equal(contactFileReadable({ ...ready, viewerId: "99999999-9999-4999-8999-999999999999" }), false);
  assert.equal(contactFileReadable({ ...ready, viewerId: null }), false);
  assert.equal(contactFileReadable({ ...ready, linked: false }), false);
  assert.equal(contactFileReadable({ ...ready, status: "pending" }), false);
  assert.equal(contactFileReadable({ ...ready, bucket: "card-attachments" }), false);
  assert.equal(contactFileReadable({ ...ready, path: contactFilePath(OWNER, CONTACT, LOOSE) }), false);
});
