import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  mergeContactDraft,
  patchFromContactDraft,
  type ContactDraftState,
} from "./merge-contact-draft.ts";
import type { ContactReading } from "./parse-contact.ts";
import { normalizeVoiceReading } from "./voice-reading.ts";

register(new URL("./voice-reading.alias-hook.mjs", import.meta.url), pathToFileURL("./"));

const { applyVoiceForm, readVoiceReply } = await import("./apply-voice-form.ts");

const PHONE = "плюс сорок четыре, семь тысяч семьсот, девятьсот, сто двадцать три";
const PHONE_EN = "plus forty-four, seven thousand seven hundred, nine hundred, one hundred twenty-three";
const DIGITS = "+447700900123";

function reading(value: unknown) {
  return normalizeVoiceReading(value) as ContactReading;
}

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

test("spoken groups and a telegram nick become contact rows", () => {
  const raw = {
    displayName: "Jordan Ellis",
    position: "Founder",
    company: "North Studio",
    lines: [PHONE, "Telegram Радиотест", "WhatsApp"],
  };
  assert.equal(raw.lines.includes(DIGITS), false);
  assert.equal(raw.lines.some((line) => line.startsWith("Telegram / @")), false);

  const next = reading(raw);
  assert.deepEqual(next.lines, [DIGITS, "Telegram / @radiotest"]);
  assert.deepEqual(next.lineFlags, [{ value: DIGITS, flags: ["wa"] }]);
  assert.equal(next.displayName, "Jordan Ellis");
});

test("one russian phrase fills every contact row once", () => {
  const next = reading({
    displayName: "Jordan Ellis",
    position: "Founder",
    company: "North Studio",
    note: "Web Summit",
    lines: [
      PHONE,
      "WhatsApp",
      "jordan at example dot com",
      "Telegram Радиотест",
      "Instagram Радиотест",
    ],
  });
  assert.equal(next.position, "Founder");
  assert.deepEqual(next.lines, [
    DIGITS,
    "jordan@example.com",
    "Telegram / @radiotest",
    "Instagram / @radiotest",
  ]);
  assert.equal(next.lines.filter((line) => line.replace(/\D/g, "") === "447700900123").length, 1);
  assert.deepEqual(next.lineFlags, [{ value: DIGITS, flags: ["wa"] }]);
});

test("groups stay in order when the commas are missing", () => {
  const next = reading({
    lines: [
      "плюс сорок четыре семь тысяч семьсот девятьсот сто двадцать три",
      "plus forty four seven thousand seven hundred nine hundred one hundred twenty three",
    ],
  });
  assert.deepEqual(next.lines, [DIGITS, DIGITS]);
});

test("english groups, spelled nick, and a spoken email keep their letters", () => {
  const next = reading({
    lines: [PHONE_EN, "иордан собачка пример точка ком", "Telegram r a d i o t e s t"],
  });
  assert.deepEqual(next.lines, [DIGITS, "iordan@primer.kom", "Telegram / @radiotest"]);
});

test("digits dictated one by one keep a spoken plus and do not grow a country code", () => {
  const next = reading({
    lines: ["плюс четыре четыре семь семь ноль ноль девять ноль ноль один два три", "девять один два три четыре пять шесть"],
  });
  assert.deepEqual(next.lines, [DIGITS, "9123456"]);
});

test("a short spoken number is not kept as an address", () => {
  const next = reading({ lines: ["плюс сорок четыре"] });
  assert.deepEqual(next.lines, []);
  assert.equal(next.lineFlags, undefined);
});

test("whatsapp and telegram marks share the one international number", () => {
  const next = reading({
    lines: ["ватсап и телеграм плюс сорок четыре, семь тысяч семьсот, девятьсот, сто двадцать три"],
  });
  assert.deepEqual(next.lines, [DIGITS]);
  assert.deepEqual(next.lineFlags, [{ value: DIGITS, flags: ["wa", "tg"] }]);
});

test("a mark is not applied when more than one number was spoken", () => {
  const next = reading({
    lines: [DIGITS, "+33612345678", "WhatsApp"],
  });
  assert.deepEqual(next.lines, [DIGITS, "+33612345678"]);
  assert.equal(next.lineFlags, undefined);
});

test("voice fills empty fields and the next correction changes only the number", () => {
  const heard = reading({
    lines: [PHONE, "Telegram Радиотест"],
    lineFlags: [{ value: PHONE, flags: ["wa"] }],
  });
  let state = mergeContactDraft(
    blank({ displayName: "Jordan Ellis", position: "Founder", company: "North Studio" }),
    patchFromContactDraft(heard),
  );
  assert.equal(state.displayName, "Jordan Ellis");
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North Studio");
  assert.equal(state.lines.length, 2);
  assert.equal(state.lines[0]?.value, DIGITS);
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[1]?.value, "Telegram / @radiotest");

  const corrected = readVoiceReply(
    {
      displayName: "Jordan Ellis",
      position: "Founder",
      company: "North Studio",
      contacts: [
        {
          lineId: state.lines[0]!.id,
          kind: "phone",
          value: "плюс сорок четыре, семь тысяч семьсот, девятьсот, сто двадцать четыре",
          flags: [],
        },
      ],
      note: { event: "", place: "", context: "", replace: false },
      removed: [],
      unclear: [],
    },
    "",
  );
  assert.ok(corrected);
  state = applyVoiceForm(
    {
      displayName: state.displayName,
      position: state.position,
      company: state.company,
      note: state.note,
      lines: state.lines,
    },
    corrected,
  ).state;
  assert.equal(state.lines[0]?.value, "+447700900124");
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[1]?.value, "Telegram / @radiotest");
  assert.equal(state.displayName, "Jordan Ellis");
  assert.equal(state.company, "North Studio");
});

test("voice first does not get overwritten by a later camera or typed fill", () => {
  const heard = reading({
    displayName: "Jordan Ellis",
    position: "Founder",
    lines: [PHONE, "Telegram Радиотест"],
  });
  let state = mergeContactDraft(blank(), patchFromContactDraft(heard));
  state = mergeContactDraft(state, {
    fills: { displayName: "Other Name", position: "Intern", company: "North Studio" },
  });
  assert.equal(state.displayName, "Jordan Ellis");
  assert.equal(state.position, "Founder");
  assert.equal(state.company, "North Studio");
  assert.equal(state.lines[0]?.value, DIGITS);
  assert.equal(state.lines[1]?.value, "Telegram / @radiotest");
});

test("model json passes normalization, the contact check, and the draft merge", async () => {
  const { contactReading } = await import("./parse-contact.ts");
  const apply = (model: unknown, state = blank()) => {
    const draft = contactReading(normalizeVoiceReading(model), { allowSets: true });
    return mergeContactDraft(state, patchFromContactDraft(draft));
  };

  let state = apply({
    displayName: "Jordan Ellis",
    position: "Founder",
    company: "North Studio",
    lines: [PHONE, "WhatsApp", "jordan at example dot com", "Telegram Радиотест", "Instagram Радиотест"],
  });
  assert.deepEqual(
    state.lines.map((line) => line.value),
    [DIGITS, "jordan@example.com", "Telegram / @radiotest", "Instagram / @radiotest"],
  );
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines.filter((line) => line.value.replace(/\D/g, "") === "447700900123").length, 1);

  const heard = readVoiceReply(
    {
      displayName: "Jordan Ellis",
      position: "Founder",
      company: "North Studio",
      contacts: [
        {
          lineId: state.lines[0]!.id,
          kind: "phone",
          value: "плюс сорок четыре, семь тысяч семьсот, девятьсот, сто двадцать четыре",
          flags: [],
        },
      ],
      note: { event: "", place: "", context: "", replace: false },
      removed: [],
      unclear: [],
    },
    "",
  );
  assert.ok(heard);
  state = applyVoiceForm(
    {
      displayName: state.displayName,
      position: state.position,
      company: state.company,
      note: state.note,
      lines: state.lines,
    },
    heard,
  ).state;
  assert.equal(state.lines[0]?.value, "+447700900124");
  assert.deepEqual(state.lines[0]?.flags, ["wa"]);
  assert.equal(state.lines[1]?.value, "jordan@example.com");
  assert.equal(state.displayName, "Jordan Ellis");

  const spoken = apply({
    lines: [
      "plus one, six hundred fifty, five hundred fifty five, zero one two three",
      "plus 1, six hundred fifty, five hundred fifty five, 0123",
      "jordan-ellis+work at example dot com",
      "Instagram https://instagram.com/jordan",
      "Telegram Радиотест",
      "plus one, two, three",
      "Baker Street, 12",
    ],
  });
  assert.deepEqual(
    spoken.lines.map((line) => line.value),
    ["+16505550123", "jordan-ellis+work@example.com", "https://instagram.com/jordan", "Telegram / @radiotest", "Baker Street, 12"],
  );
  assert.equal(spoken.lines.some((line) => /six hundred|httpsinstagram|jordanelliswork/i.test(line.value)), false);
});

test("an unclear number correction is skipped and the other data is kept", () => {
  const start = blank({
    displayName: "Jordan Ellis",
    lines: [
      { id: "1", value: DIGITS, flags: ["wa"] },
      { id: "2", value: "+33612345678", flags: [] },
    ],
  });
  const corrected = reading({
    company: "North Studio",
    sets: { line: { to: PHONE_EN } },
  });
  const state = mergeContactDraft(start, patchFromContactDraft(corrected));
  assert.equal(state.company, "North Studio");
  assert.equal(state.lines[0]?.value, DIGITS);
  assert.equal(state.lines[1]?.value, "+33612345678");
});
