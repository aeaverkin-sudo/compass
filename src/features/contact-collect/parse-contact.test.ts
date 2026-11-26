import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { contactDraftSetsOf, contactLineFlagsOf, readingExtras } = await import("./contact-reading.ts");
import {
  mergeContactDraft,
  patchFromContactDraft,
  patchHasContent,
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

test("old flat draft maps to fills only", () => {
  const patch = patchFromContactDraft({
    displayName: "Jordan Ellis",
    position: "Founder",
    company: "North Studio",
    note: "Web Summit",
    lines: ["+44 7700 900123", "jordan@example.com"],
  });
  assert.equal(patch.sets, undefined);
  assert.equal(patch.lineFlags, undefined);
  assert.deepEqual(patch.fills?.lines, ["+44 7700 900123", "jordan@example.com"]);
});

test("sets-only and lineFlags-only patches have content", () => {
  const setsOnly = patchFromContactDraft({
    displayName: "",
    position: "",
    company: "",
    note: "",
    lines: [],
    sets: { position: "Founder" },
  });
  const flagsOnly = patchFromContactDraft({
    displayName: "",
    position: "",
    company: "",
    note: "",
    lines: [],
    lineFlags: [{ value: "+44 7700 900123", flags: ["wa"] }],
  });
  assert.equal(patchHasContent(setsOnly), true);
  assert.equal(patchHasContent(flagsOnly), true);
});

test("WhatsApp mark adds flag without duplicating the phone", () => {
  const state = mergeContactDraft(
    blank({ lines: [{ id: "1", value: "+447700900123", flags: [] }] }),
    patchFromContactDraft({
      displayName: "",
      position: "",
      company: "",
      note: "",
      lines: [],
      lineFlags: [{ value: "+44 7700 900123", flags: ["wa"] }],
    }),
  );
  assert.equal(state.lines.length, 1);
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
});

test("explicit position and phone sets change only the target", () => {
  const state = mergeContactDraft(
    blank({
      displayName: "Jordan",
      position: "Designer",
      lines: [
        { id: "1", value: "+44 7700 900123", flags: ["wa"] },
        { id: "2", value: "jordan@example.com", flags: [] },
      ],
    }),
    patchFromContactDraft({
      displayName: "",
      position: "",
      company: "",
      note: "",
      lines: ["should not matter for sets"],
      sets: {
        position: "Founder",
        line: { from: "+44 7700 900123", to: "+44 7700 900999" },
      },
    }),
  );
  assert.equal(state.displayName, "Jordan");
  assert.equal(state.position, "Founder");
  assert.equal(state.lines[0]?.value, "+44 7700 900999");
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[1]?.value, "jordan@example.com");
});

test("ambiguous phone set is dropped; clear data still applies", () => {
  const sets = contactDraftSetsOf({
    line: { to: "+44 7000 000000" },
    position: "Founder",
  });
  assert.deepEqual(sets, { position: "Founder", line: { to: "+44 7000 000000" } });
  const state = mergeContactDraft(
    blank({
      position: "Designer",
      lines: [
        { id: "1", value: "+44 7700 900123", flags: [] },
        { id: "2", value: "+33 612 345 678", flags: [] },
      ],
    }),
    {
      sets,
      fills: { company: "North Studio" },
    },
  );
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North Studio");
  assert.equal(state.lines[0]?.value, "+44 7700 900123");
  assert.equal(state.lines[1]?.value, "+33 612 345 678");
});

test("broken sets and flags are stripped by the validator", () => {
  const extras = readingExtras({
    sets: {
      position: "   ",
      line: { to: "" },
      company: "North Studio",
    },
    lineFlags: [{ value: "", flags: ["wa"] }, { value: "+44 7700 900123", flags: ["nope"] }],
  });
  assert.deepEqual(extras.sets, { company: "North Studio" });
  assert.equal(extras.lineFlags, undefined);
});

test("photo extras drop sets even if the model sent them", () => {
  const extras = readingExtras(
    {
      sets: { position: "Founder" },
      lineFlags: [{ value: "+44 7700 900123", flags: ["wa"] }],
    },
    { allowSets: false },
  );
  assert.equal(extras.sets, undefined);
  assert.deepEqual(extras.lineFlags, [{ value: "+44 7700 900123", flags: ["wa"] }]);
  const patch = patchFromContactDraft(
    {
      displayName: "Jordan",
      position: "",
      company: "",
      note: "",
      lines: [],
      ...extras,
    },
    { allowSets: false },
  );
  assert.equal(patch.sets, undefined);
  assert.equal(patchHasContent(patch), true);
});

test("lineFlags validator keeps only wa/tg marks", () => {
  assert.deepEqual(contactLineFlagsOf([{ value: "+44 7700 900123", flags: ["wa", "tg", "xx"] }]), [
    { value: "+44 7700 900123", flags: ["wa", "tg"] },
  ]);
});
