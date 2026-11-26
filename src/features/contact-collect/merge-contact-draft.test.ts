import assert from "node:assert/strict";
import test from "node:test";
import {
  draftLineKind,
  mergeContactDraft,
  patchFromContactDraft,
  patchFromScan,
  type ContactDraftState,
} from "./merge-contact-draft.ts";

function blank(partial: Partial<ContactDraftState> = {}): ContactDraftState {
  return {
    displayName: "",
    position: "",
    company: "",
    note: "",
    lines: [],
    ...partial,
  };
}

test("email by hand then voice name/phone then scan position", () => {
  let state = blank({
    lines: [{ id: "1", value: "jordan@example.com", flags: [] }],
  });
  state = mergeContactDraft(
    state,
    patchFromContactDraft({
      displayName: "Jordan Ellis",
      position: "",
      company: "",
      note: "",
      lines: ["+44 7700 900123"],
    }),
  );
  state = mergeContactDraft(
    state,
    patchFromScan({ name: "Ignored Name", lines: [] }),
  );
  state = mergeContactDraft(state, {
    fills: { position: "Founder" },
  });
  assert.equal(state.displayName, "Jordan Ellis");
  assert.equal(state.position, "Founder");
  assert.deepEqual(
    state.lines.map((line) => line.value),
    ["jordan@example.com", "+44 7700 900123"],
  );
});

test("fill does not overwrite a hand correction", () => {
  let state = mergeContactDraft(
    blank(),
    patchFromContactDraft({
      displayName: "Jordan",
      position: "Designer",
      company: "",
      note: "",
      lines: [],
    }),
  );
  state = { ...state, position: "Founder" };
  state = mergeContactDraft(
    state,
    patchFromContactDraft({
      displayName: "Other",
      position: "CEO",
      company: "North",
      note: "",
      lines: [],
    }),
  );
  assert.equal(state.displayName, "Jordan");
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North");
});

test("explicit set changes only the named field", () => {
  const state = mergeContactDraft(
    blank({
      displayName: "Jordan",
      position: "Designer",
      company: "North Studio",
      note: "Web Summit",
      lines: [{ id: "1", value: "+447700900123", flags: [] }],
    }),
    {
      sets: { position: "Founder" },
      fills: {
        displayName: "Should stay",
        company: "Other Co",
        note: "extra",
        lines: ["+44 7700 900999"],
      },
    },
  );
  assert.equal(state.displayName, "Jordan");
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North Studio");
  assert.equal(state.note, "Web Summit\nextra");
  assert.equal(state.lines.length, 2);
  assert.equal(state.lines[0]?.value, "+447700900123");
});

test("explicit line replace with clear from", () => {
  const state = mergeContactDraft(
    blank({
      lines: [
        { id: "1", value: "+44 7700 900123", flags: ["wa"] },
        { id: "2", value: "jordan@example.com", flags: [] },
      ],
    }),
    { sets: { line: { from: "+447700900123", to: "+44 7700 900999" } } },
  );
  assert.equal(state.lines[0]?.value, "+44 7700 900999");
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[1]?.value, "jordan@example.com");
});

test("a line without a clear target is added, not written over another", () => {
  const start = blank({
    position: "Designer",
    lines: [
      { id: "1", value: "+44 7700 900123", flags: [] },
      { id: "2", value: "+33 612 345 678", flags: [] },
    ],
  });
  const state = mergeContactDraft(start, {
    sets: {
      position: "   ",
      line: { to: "+44 7000 000000" },
    },
    fills: { company: "North Studio" },
  });
  assert.equal(state.position, "Designer");
  assert.equal(state.company, "North Studio");
  assert.deepEqual(
    state.lines.map((line) => line.value),
    ["+44 7700 900123", "+33 612 345 678", "+44 7000 000000"],
  );
});

test("an email correction does not replace the phone", () => {
  const state = mergeContactDraft(
    blank({
      lines: [
        { id: "1", value: "+44 7700 900123", flags: [] },
        { id: "2", value: "jordan@example.com", flags: [] },
      ],
    }),
    { sets: { line: { to: "jordanellis@example.com" } } },
  );
  assert.deepEqual(
    state.lines.map((line) => line.value),
    ["+44 7700 900123", "jordan@example.com", "jordanellis@example.com"],
  );
});

test("a value of another kind does not overwrite the named line", () => {
  const state = mergeContactDraft(
    blank({
      lines: [
        { id: "1", value: "+44 7700 900123", flags: ["wa"] },
        { id: "2", value: "jordan@example.com", flags: [] },
      ],
    }),
    { sets: { line: { from: "+44 7700 900123", to: "other@example.com" } } },
  );
  assert.equal(state.lines[0]?.value, "+44 7700 900123");
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[2]?.value, "other@example.com");
});

test("draftLineKind tells a phone, an email, a nick, a link, and plain text apart", () => {
  assert.equal(draftLineKind("+44 7700 900123"), "phone");
  assert.equal(draftLineKind("jordan@example.com"), "email");
  assert.equal(draftLineKind("Telegram / @radiotest"), "telegram");
  assert.equal(draftLineKind("Instagram / @radiotest"), "instagram");
  assert.equal(draftLineKind("https://example.com/card"), "link");
  assert.equal(draftLineKind("Met near the north gate"), "text");
});

test("repeat phone merges flags and does not duplicate", () => {
  const state = mergeContactDraft(
    blank({
      lines: [{ id: "1", value: "+44 7700 900123", flags: ["wa"] }],
    }),
    {
      fills: { lines: ["+447700900123", "+44 (7700) 900-123"] },
      lineFlags: [{ value: "+44 7700 900123", flags: ["tg", "wa"] }],
    },
  );
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0]?.value, "+44 7700 900123");
  assert.deepEqual(state.lines[0]?.flags, ["wa", "tg"]);
});

test("note fills append without duplicating the same text", () => {
  let state = mergeContactDraft(blank(), { fills: { note: "Web Summit" } });
  state = mergeContactDraft(state, { fills: { note: "встретились за обедом" } });
  state = mergeContactDraft(state, { fills: { note: "web summit" } });
  assert.equal(state.note, "Web Summit\nвстретились за обедом");
});
