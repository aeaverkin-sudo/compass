import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { applyVoiceForm } = await import("./apply-voice-form.ts");
const {
  addVoiceWords,
  applySpokenTightening,
  spokenMeetingNote,
  spokenWordCount,
  tightenVoicePayload,
  VOICE_WORD_LIMIT,
  voiceNoteText,
} = await import("./voice-dialog.ts");
const { mergeContactDraft } = await import("./merge-contact-draft.ts");

test("one word tightens the email and the nick, and leaves the other rows", () => {
  assert.equal(applySpokenTightening("исправь, в одно слово", "mira-chen@example.com"), "mirachen@example.com");
  assert.equal(applySpokenTightening("please, no hyphens", "north-line"), "north-line");
  assert.equal(applySpokenTightening("fix the email", "mira-chen@example.com"), "mira-chen@example.com");
  const tightened = tightenVoicePayload(
    {
      displayName: "Anne-Marie",
      lines: ["mira-chen@example.com", "Telegram / @nick", "https://north-line.example", "Telegram / @radio-test"],
      note: "Web Summit",
      contacts: [{ lineId: null, kind: "email", value: "mira-chen@example.com", flags: [] }],
    },
    "в одно слово",
  ) as {
    displayName: string;
    lines: string[];
    note: string;
    contacts: { value: string }[];
  };
  assert.equal(tightened.displayName, "Anne-Marie");
  assert.equal(tightened.note, "Web Summit");
  assert.deepEqual(tightened.lines, [
    "mirachen@example.com",
    "Telegram / @nick",
    "https://north-line.example",
    "Telegram / @radiotest",
  ]);
  assert.equal(tightened.contacts[0]?.value, "mirachen@example.com");
});

test("words add up for the session, and the recording that crosses 200 is kept whole", () => {
  assert.equal(spokenWordCount("  Met   Mira\nChen at the hall. "), 6);
  assert.equal(spokenWordCount(""), 0);
  assert.equal(VOICE_WORD_LIMIT, 200);
  const early = addVoiceWords(0, spokenWordCount("one two three"));
  assert.deepEqual(early, { total: 3, reached: false });
  const near = addVoiceWords(190, 0);
  assert.equal(near.reached, false);
  const crossed = addVoiceWords(190, spokenWordCount("alpha beta gamma delta epsilon"));
  assert.equal(crossed.total, 195);
  const over = addVoiceWords(190, 15);
  assert.deepEqual(over, { total: 205, reached: true });
  assert.equal(addVoiceWords(200, 0).reached, true);
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
  const replacedForm = applyVoiceForm(
    { displayName: "", position: "", company: "", note: "Old note.", lines: [] },
    {
      displayName: "",
      position: "",
      company: "",
      contacts: [],
      note: { event: "Web Summit", place: "", context: "Met at a café", replace: true },
      removed: [],
      unclear: [],
    },
  );
  assert.equal(replacedForm.state.note, replaced?.text);

  const added = voiceNoteText({ place: "Riverside Hall", context: "Talked about a book" });
  assert.equal(
    mergeContactDraft(
      { displayName: "", position: "", company: "", note: "Old note.", lines: [] },
      { fills: { note: added?.text } },
    ).note,
    "Old note.\nRiverside Hall. Talked about a book.",
  );
});
