import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  mergeContactDraft,
  type ContactDraftState,
  type VoiceCursor,
} from "./merge-contact-draft.ts";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { applySpokenTightening, spokenMeetingNote, tightenVoicePayload, voiceLineOpsOf, voiceNoteText } =
  await import("./voice-dialog.ts");

function blank(over: Partial<ContactDraftState> = {}): ContactDraftState {
  return { displayName: "", position: "", company: "", note: "", lines: [], ...over };
}

function row(value: string) {
  return { id: value, value, flags: [] as ContactDraftState["lines"][number]["flags"] };
}

test("a name said again replaces the old name and leaves the other fields", () => {
  const cursor: VoiceCursor = { line: null, field: null };
  const state = mergeContactDraft(
    blank({ displayName: "Jordan Ellis", position: "Founder", company: "North Studio" }),
    { sets: { displayName: "Mira Chen" } },
    cursor,
  );
  assert.equal(state.displayName, "Mira Chen");
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North Studio");
  assert.equal(cursor.field, "displayName");
});

test("an email correction does not change the phone", () => {
  const state = mergeContactDraft(
    blank({ lines: [row("+447700900123"), row("jordan@example.com")] }),
    { lineOps: [{ op: "replace", value: "mira.chen@example.com" }] },
  );
  assert.equal(state.lines[0]?.value, "+447700900123");
  assert.equal(state.lines[1]?.value, "mira.chen@example.com");
  assert.equal(state.lines.length, 2);
});

test("a replace of the wrong kind is added and the named line stays", () => {
  const state = mergeContactDraft(blank({ lines: [row("+447700900123")] }), {
    lineOps: [{ op: "replace", n: 1, value: "mira.chen@example.com" }],
  });
  assert.equal(state.lines[0]?.value, "+447700900123");
  assert.equal(state.lines[1]?.value, "mira.chen@example.com");
});

test("several rows of one kind follow the last voice line, otherwise the value is added", () => {
  const cursor: VoiceCursor = { line: 2, field: null };
  const replaced = mergeContactDraft(
    blank({ lines: [row("+447700900123"), row("+447700900124")] }),
    { lineOps: [{ op: "replace", value: "+447700900199" }] },
    cursor,
  );
  assert.equal(replaced.lines[0]?.value, "+447700900123");
  assert.equal(replaced.lines[1]?.value, "+447700900199");

  const added = mergeContactDraft(blank({ lines: [row("+447700900123"), row("+447700900124")] }), {
    lineOps: [{ op: "replace", value: "+447700900199" }],
  });
  assert.equal(added.lines[0]?.value, "+447700900123");
  assert.equal(added.lines[1]?.value, "+447700900124");
  assert.equal(added.lines[2]?.value, "+447700900199");
});

test("a hand-edited name stays when the recording only adds a phone", () => {
  const state = mergeContactDraft(blank({ displayName: "Mira Chen", lines: [row("+447700900123")] }), {
    lineOps: [{ op: "add", value: "+447700900124" }],
  });
  assert.equal(state.displayName, "Mira Chen");
  assert.deepEqual(
    state.lines.map((line) => line.value),
    ["+447700900123", "+447700900124"],
  );
});

test("one word tightens the email and the nick, and leaves the other rows", () => {
  assert.equal(applySpokenTightening("исправь, в одно слово", "mira-chen@example.com"), "mirachen@example.com");
  assert.equal(applySpokenTightening("please, no hyphens", "north-line"), "north-line");
  assert.equal(applySpokenTightening("fix the email", "mira-chen@example.com"), "mira-chen@example.com");
  const tightened = tightenVoicePayload(
    {
      displayName: "Anne-Marie",
      lines: ["mira-chen@example.com", "Telegram / @nick", "https://north-line.example", "Telegram / @radio-test"],
      note: "Web Summit",
      lineOps: [{ op: "add", value: "mira-chen@example.com" }],
    },
    "в одно слово",
  ) as { displayName: string; lines: string[]; note: string; lineOps: { value: string }[] };
  assert.equal(tightened.displayName, "Anne-Marie");
  assert.equal(tightened.note, "Web Summit");
  assert.deepEqual(tightened.lines, [
    "mirachen@example.com",
    "Telegram / @nick",
    "https://north-line.example",
    "Telegram / @radiotest",
  ]);
  assert.equal(tightened.lineOps[0]?.value, "mirachen@example.com");
});

test("a line is removed only by an explicit remove, and only the first one", () => {
  const start = blank({
    lines: [row("+447700900123"), row("jordan@example.com"), row("Telegram / @radiotest")],
  });
  const kept = mergeContactDraft(start, {
    lineOps: voiceLineOpsOf([{ op: "add", value: "Instagram / @northline" }]),
  });
  assert.equal(kept.lines.length, 4);

  const once = mergeContactDraft(start, {
    lineOps: voiceLineOpsOf([
      { op: "remove", n: 2 },
      { op: "remove", n: 1 },
    ]),
  });
  assert.deepEqual(
    once.lines.map((line) => line.value),
    ["+447700900123", "Telegram / @radiotest"],
  );
  assert.equal(voiceLineOpsOf([{ op: "replace", value: "jordan@example.com" }, { n: 1 }])?.length, 1);
});

test("an event or a place becomes the note, then the context", () => {
  assert.equal(spokenMeetingNote("Web Summit", "", "Met at a café"), "Web Summit. Met at a café.");
  assert.equal(
    spokenMeetingNote("", "Parque Eduardo VII", "Talked about investments"),
    "Parque Eduardo VII. Talked about investments.",
  );
  assert.equal(spokenMeetingNote("Web Summit", "", ""), "Web Summit.");
  assert.equal(
    spokenMeetingNote("Web Summit", "Lisbon", "Met at the afterparty"),
    "Web Summit, Lisbon. Met at the afterparty.",
  );
  assert.equal(
    spokenMeetingNote("", "Riverside Hall", "Talked about a book"),
    "Riverside Hall. Talked about a book.",
  );

  const replaced = voiceNoteText({ event: "Web Summit", context: "Met at a café", replace: true });
  assert.equal(
    mergeContactDraft(blank({ note: "Old note." }), { sets: { note: replaced?.text } }).note,
    "Web Summit. Met at a café.",
  );
  const added = voiceNoteText({ place: "Riverside Hall", context: "Talked about a book" });
  assert.equal(
    mergeContactDraft(blank({ note: "Old note." }), { fills: { note: added?.text } }).note,
    "Old note.\nRiverside Hall. Talked about a book.",
  );
});
