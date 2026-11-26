import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { applyVoiceForm, readVoiceReply, voiceResponseFormat, voiceResponseSchema } = await import(
  "./apply-voice-form.ts"
);
const { externalLineIsRed } = await import("./lines.ts");

const BANNED = new Set([
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "default",
  "oneOf",
  "allOf",
  "anyOf",
  "$ref",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "uniqueItems",
  "const",
]);

type Line = { id: string; value: string; flags: ("wa" | "tg")[] };

function form(over: Partial<{ displayName: string; position: string; company: string; note: string; lines: Line[] }> = {}) {
  return {
    displayName: "",
    position: "",
    company: "",
    note: "",
    lines: [] as Line[],
    ...over,
  };
}

function reply(over: Record<string, unknown> = {}) {
  return {
    displayName: "",
    position: "",
    company: "",
    contacts: [],
    note: { event: "", place: "", context: "", replace: false },
    removed: [],
    unclear: [],
    ...over,
  };
}

function values(lines: Line[]) {
  return lines.map((line) => line.value);
}

test("a filled name, role, or company replaces, and a blank one stays", () => {
  const before = form({ displayName: "Nora Blake", position: "Editor", company: "Holm" });
  const next = applyVoiceForm(
    before,
    reply({ displayName: "Mira Chen", position: "   ", company: "" }),
  );
  assert.equal(next.state.displayName, "Mira Chen");
  assert.equal(next.state.position, "Editor");
  assert.equal(next.state.company, "Holm");
  assert.equal(next.changed, true);

  const same = applyVoiceForm(before, reply({ displayName: "Nora Blake", position: "Editor", company: "Holm" }));
  assert.equal(same.changed, false);
});

test("WhatsApp named with a number is one phone line with that mark", () => {
  const heard = readVoiceReply(
    reply({
      contacts: [{ lineId: null, kind: "phone", value: "WhatsApp +447700900123", flags: [] }],
    }),
    "",
  );
  assert.equal(heard?.contacts.length, 1);
  assert.equal(heard?.contacts[0]?.value, "+447700900123");
  assert.deepEqual(heard?.contacts[0]?.flags, ["wa"]);
  const next = applyVoiceForm(form(), heard!);
  assert.equal(next.state.lines.length, 1);
  assert.equal(next.state.lines[0]?.value, "+447700900123");
  assert.deepEqual(next.state.lines[0]?.flags, ["wa"]);
});

test("a bare number is a phone line with no mark", () => {
  const heard = readVoiceReply(
    reply({ contacts: [{ lineId: null, kind: "phone", value: "+447700900456", flags: [] }] }),
    "",
  );
  const next = applyVoiceForm(form(), heard!);
  assert.equal(next.state.lines.length, 1);
  assert.equal(next.state.lines[0]?.value, "+447700900456");
  assert.deepEqual(next.state.lines[0]?.flags, []);
});

test("a mark lands on a number already saved, and a second phone does not take it", () => {
  const before = form({
    lines: [{ id: "phone-a", value: "+447700900123", flags: ["wa"] }],
  });
  const marked = applyVoiceForm(
    form({ lines: [{ id: "phone-a", value: "+447700900123", flags: [] }] }),
    reply({
      contacts: [{ lineId: null, kind: "phone", value: "+447700900123", flags: ["wa"] }],
    }),
  );
  assert.equal(marked.state.lines.length, 1);
  assert.deepEqual(marked.state.lines[0]?.flags, ["wa"]);

  const second = applyVoiceForm(
    before,
    reply({
      contacts: [
        { lineId: "phone-a", kind: "phone", value: "+447700900123", flags: [] },
        { lineId: null, kind: "phone", value: "+33612345678", flags: [] },
      ],
    }),
  );
  assert.deepEqual(values(second.state.lines), ["+447700900123", "+33612345678"]);
  assert.deepEqual(second.state.lines[0]?.flags, ["wa"]);
  assert.deepEqual(second.state.lines[1]?.flags, []);
});

test("replacing a number keeps its marks, and a voice reply cannot clear them", () => {
  const before = form({
    lines: [{ id: "phone-a", value: "+447700900123", flags: ["wa"] }],
  });
  const next = applyVoiceForm(
    before,
    reply({
      contacts: [{ lineId: "phone-a", kind: "phone", value: "+447700900999", flags: [] }],
    }),
  );
  assert.equal(next.state.lines.length, 1);
  assert.equal(next.state.lines[0]?.id, "phone-a");
  assert.equal(next.state.lines[0]?.value, "+447700900999");
  assert.deepEqual(next.state.lines[0]?.flags, ["wa"]);

  const added = applyVoiceForm(
    before,
    reply({
      contacts: [{ lineId: "phone-a", kind: "phone", value: "+447700900123", flags: ["tg"] }],
    }),
  );
  assert.deepEqual(added.state.lines[0]?.flags, ["wa", "tg"]);
});

test("a telegram nick stays its own line", () => {
  const next = applyVoiceForm(
    form({ lines: [{ id: "phone-a", value: "+447700900123", flags: ["wa"] }] }),
    reply({
      contacts: [
        { lineId: "phone-a", kind: "phone", value: "+447700900123", flags: [] },
        { lineId: null, kind: "telegram", value: "Telegram / @radiotest", flags: ["tg"] },
      ],
    }),
  );
  assert.deepEqual(values(next.state.lines), ["+447700900123", "Telegram / @radiotest"]);
  assert.deepEqual(next.state.lines[0]?.flags, ["wa"]);
  assert.deepEqual(next.state.lines[1]?.flags, []);
});

test("the same line is replaced in place, and a different kind is added beside it", () => {
  const before = form({
    lines: [
      { id: "phone-a", value: "+447700900123", flags: ["wa"] },
      { id: "mail-a", value: "nora@holm.example", flags: [] },
    ],
  });
  const replaced = applyVoiceForm(
    before,
    reply({
      contacts: [{ lineId: "mail-a", kind: "email", value: "mira@holm.example", flags: [] }],
    }),
  );
  assert.equal(replaced.state.lines[0]?.value, "+447700900123");
  assert.equal(replaced.state.lines[1]?.id, "mail-a");
  assert.equal(replaced.state.lines[1]?.value, "mira@holm.example");

  const beside = applyVoiceForm(
    before,
    reply({
      contacts: [{ lineId: "phone-a", kind: "email", value: "other@holm.example", flags: ["wa"] }],
    }),
  );
  assert.equal(beside.state.lines[0]?.value, "+447700900123");
  assert.deepEqual(beside.state.lines[0]?.flags, ["wa"]);
  assert.equal(beside.state.lines[2]?.value, "other@holm.example");
});

test("a missing line stays, an unknown id is added, and only the first removal counts", () => {
  const before = form({
    displayName: "Nora Blake",
    lines: [
      { id: "phone-a", value: "+447700900123", flags: ["wa"] },
      { id: "mail-a", value: "nora@holm.example", flags: [] },
    ],
  });
  const kept = applyVoiceForm(before, reply({ contacts: [], displayName: "" }));
  assert.equal(kept.changed, false);
  assert.deepEqual(values(kept.state.lines), ["+447700900123", "nora@holm.example"]);
  assert.equal(kept.state.displayName, "Nora Blake");

  const added = applyVoiceForm(
    before,
    reply({
      contacts: [{ lineId: "missing", kind: "phone", value: "+33612345678", flags: [] }],
    }),
  );
  assert.equal(added.state.lines.length, 3);
  assert.equal(added.state.lines[2]?.value, "+33612345678");
  assert.notEqual(added.state.lines[2]?.id, "missing");

  const removed = applyVoiceForm(
    before,
    reply({ removed: ["gone", "mail-a", "phone-a"] }),
  );
  assert.deepEqual(
    removed.state.lines.map((line) => line.id),
    ["phone-a"],
  );
  assert.deepEqual(removed.state.lines[0]?.flags, ["wa"]);
});

test("a note is appended, not doubled, replaced, or cleared", () => {
  const before = form({ note: "Old note." });
  const appended = applyVoiceForm(
    before,
    reply({ note: { event: "Web Summit", place: "", context: "Met at a café", replace: false } }),
  );
  assert.equal(appended.state.note, "Old note.\nWeb Summit. Met at a café.");

  const again = applyVoiceForm(
    appended.state,
    reply({ note: { event: "Web Summit", place: "", context: "Met at a café", replace: false } }),
  );
  assert.equal(again.changed, false);

  const replaced = applyVoiceForm(
    before,
    reply({ note: { event: "", place: "Riverside Hall", context: "", replace: true } }),
  );
  assert.equal(replaced.state.note, "Riverside Hall.");

  const cleared = applyVoiceForm(
    before,
    reply({ note: { event: "", place: "", context: "", replace: true } }),
  );
  assert.equal(cleared.state.note, "");
  assert.equal(cleared.changed, true);
});

test("unclear is ignored and a refused line is not written", () => {
  assert.equal(externalLineIsRed("@@@@"), true);
  const before = form({ displayName: "Nora Blake", lines: [{ id: "phone-a", value: "+447700900123", flags: [] }] });
  const next = applyVoiceForm(
    before,
    reply({
      displayName: "Nora Blake",
      contacts: [{ lineId: null, kind: "other", value: "@@@@", flags: [] }],
      unclear: ["company"],
    }),
  );
  assert.equal(next.changed, false);
  assert.equal(next.state.lines.length, 1);
});

test("a reply that is not the form is refused", () => {
  assert.equal(readVoiceReply(null, ""), null);
  assert.equal(readVoiceReply(reply({ contacts: [{ lineId: null, kind: "phone", value: "+447700900123" }] }), ""), null);
  assert.equal(
    readVoiceReply(
      reply({
        contacts: [{ lineId: null, kind: "fax", value: "+447700900123", flags: [] }],
      }),
      "",
    ),
    null,
  );
  assert.equal(
    readVoiceReply(reply({ note: { event: "", place: "", context: "", replace: "yes" } }), ""),
    null,
  );
});

test("the voice schema is valid for strict structured output", () => {
  const format = voiceResponseFormat();
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.name, "voice_form");
  assert.equal(format.json_schema.schema, voiceResponseSchema);

  const walk = (node: unknown) => {
    assert.equal(typeof node, "object");
    assert.ok(node);
    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) assert.equal(BANNED.has(key), false, key);
    if (record.type === "object") {
      assert.equal(record.additionalProperties, false);
      const properties = record.properties as Record<string, unknown>;
      const required = record.required as string[];
      assert.deepEqual([...required].sort(), Object.keys(properties).sort());
      for (const child of Object.values(properties)) walk(child);
    }
    if (record.type === "array") walk(record.items);
  };
  walk(voiceResponseSchema);

  const contact = (voiceResponseSchema.properties.contacts as { items: { required: string[] } }).items;
  assert.ok(contact.required.includes("flags"));
  assert.ok(contact.required.includes("lineId"));
  const note = voiceResponseSchema.properties.note as { required: string[] };
  assert.ok(note.required.includes("replace"));
});
