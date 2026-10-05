#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function projectPath(...parts) {
  return path.join(process.cwd(), ...parts);
}

const FORBID = /не трог|не прав|не мен|не разреш|оставь|don't touch|do not (?:touch|edit|change)|leave it/i;
const BARE_YES = /^(?:да|yes|ok|ок|разрешаю|подтверждаю|можно)[.!\s]*$/i;
const BARE_NO = /^(?:нет|no|не надо|не разрешаю)[.!\s]*$/i;
const ALLOW = /разреша|подтвержда|можно править|можно менять|вноси правк|(?:^|\s)(?:да|yes|ок|ok)(?:\s|[.,!?]|$)/i;
const MUTATE =
  /(?:>>?|\|\s*tee\b|\bsed\s+-[^\n]*\bi\b|\bperl\s+-[^\n]*\bi\b|\bpython\d?(?:\.\d+)?\b|\bnode\b|\bruby\b|\brm\b|\bmv\b|\bcp\b|\btouch\b|\bgit\s+(?:add|checkout|restore|reset|commit|apply|am|stash)\b|\bpatch\b|\btee\b)/i;

function parseLocks(text) {
  const locks = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("|").map((part) => part.trim());
    if (parts.length < 2) continue;
    const [label, file, aliasText = ""] = parts;
    const aliases = aliasText
      .split(",")
      .map((alias) => alias.trim().toLowerCase())
      .filter(Boolean);
    aliases.push(file.toLowerCase());
    locks.push({ label, file, aliases });
  }
  return locks;
}

function readLocks() {
  try {
    return parseLocks(fs.readFileSync(projectPath(".cursor/locks.txt"), "utf8"));
  } catch {
    return [];
  }
}

function sentences(prompt) {
  return String(prompt).split(/[\n.!?]+/);
}

function namedLocks(prompt, locks) {
  const open = new Set();
  for (const sentence of sentences(prompt)) {
    if (FORBID.test(sentence)) continue;
    const lower = sentence.toLowerCase();
    for (const lock of locks) {
      if (lock.aliases.some((alias) => lower.includes(alias))) open.add(lock.file);
    }
  }
  return [...open];
}

function consentFromPrompt(prompt, locks, pending) {
  const text = String(prompt).trim();
  if (BARE_NO.test(text)) return [];
  if (BARE_YES.test(text)) return pending;
  if (!ALLOW.test(text)) return [];
  return namedLocks(text, locks);
}

function consentPath() {
  return projectPath(".cursor/locks/consent.json");
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(consentPath(), "utf8"));
    return {
      files: new Set(Array.isArray(data.files) ? data.files : []),
      pending: Array.isArray(data.pending) ? data.pending : [],
    };
  } catch {
    return { files: new Set(), pending: [] };
  }
}

function writeState(files, pending) {
  const file = consentPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ files: [...files], pending }));
}

function relative(file) {
  if (!file || typeof file !== "string") return "";
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  return path.relative(process.cwd(), abs).split(path.sep).join("/");
}

function inputObject(input) {
  if (input && typeof input.tool_input === "string") {
    try {
      return JSON.parse(input.tool_input);
    } catch {
      return {};
    }
  }
  if (input && input.tool_input && typeof input.tool_input === "object") return input.tool_input;
  return {};
}

function editedFiles(input) {
  const tool = inputObject(input);
  const found = [];
  for (const key of ["path", "file_path", "filePath", "target_notebook"]) {
    const file = relative(tool[key]);
    if (file) found.push(file);
  }
  return found;
}

function isFileEdit(input) {
  const name = input.tool_name || "";
  if (["Write", "StrReplace", "Delete", "EditNotebook", "ApplyPatch"].includes(name)) return true;
  const tool = inputObject(input);
  return (
    Object.prototype.hasOwnProperty.call(tool, "old_string") ||
    Object.prototype.hasOwnProperty.call(tool, "contents") ||
    Object.prototype.hasOwnProperty.call(tool, "new_string") ||
    Object.prototype.hasOwnProperty.call(tool, "is_new_cell")
  );
}

function lockedHits(files, locks) {
  return locks.filter((lock) => files.includes(lock.file));
}

function denyEdit(hits, locks) {
  const labels = new Set(hits.map((hit) => hit.label));
  const pending = locks.filter((lock) => labels.has(lock.label)).map((lock) => lock.file);
  writeState(readState().files, pending);
  const label = hits[0].label;
  const file = hits.map((hit) => hit.file).join(", ");
  return {
    permission: "deny",
    user_message: `Замок: ${label}. Правка ${file} остановлена. Напишите «разрешаю» или «да», если эту страницу можно менять.`,
    agent_message: `LOCKED (${label}): ${file}. The edit was blocked. Stop and ask the user to confirm. Do not retry, do not write the file from the shell, and do not write .cursor/locks/consent.json.`,
  };
}

function handle(input, locks = readLocks()) {
  const event = input.hook_event_name || "";

  if (event === "beforeSubmitPrompt" || (input.prompt && !input.tool_name && !input.command)) {
    const pending = readState().pending;
    writeState(new Set(consentFromPrompt(input.prompt || "", locks, pending)), []);
    return { continue: true };
  }

  if (event === "beforeShellExecution" || (typeof input.command === "string" && !input.tool_name)) {
    return handleShell(input.command || "", locks);
  }

  if (input.tool_name === "Shell") return { permission: "allow" };
  if (!isFileEdit(input)) return { permission: "allow" };

  const files = editedFiles(input);
  if (files.some((file) => file === ".cursor/locks/consent.json")) {
    return {
      permission: "deny",
      user_message: "Файл согласия замка закрыт. Его пишет только ваш ответ в чате.",
      agent_message: "Do not write .cursor/locks/consent.json. Consent comes only from the user's message.",
    };
  }

  const hits = lockedHits(files, locks).filter((lock) => !readState().files.has(lock.file));
  if (hits.length === 0) return { permission: "allow" };
  return denyEdit(hits, locks);
}

function handleShell(command, locks) {
  if (command.includes(".cursor/locks/consent.json") && MUTATE.test(command)) {
    return {
      permission: "deny",
      user_message: "Команда записывает файл согласия замка. Она остановлена.",
      agent_message: "Do not write .cursor/locks/consent.json from the shell.",
    };
  }
  const consent = readState().files;
  const hits = locks.filter((lock) => command.includes(lock.file) && !consent.has(lock.file));
  if (hits.length === 0) return { permission: "allow" };
  if (!MUTATE.test(command)) return { permission: "allow" };
  const label = hits[0].label;
  return {
    permission: "ask",
    user_message: `Команда изменит закрытую страницу «${label}». Разрешить её?`,
    agent_message: `This command would change a locked screen (${label}). The user must approve it.`,
  };
}

function runTests() {
  const locks = parseLocks(`
Sign in and Sign up | src/app/register/register-screen.tsx | sign in, sign-up
Lock list | .cursor/locks.txt | список замков
`);
  const assert = (name, got, expected) => {
    const left = JSON.stringify(got);
    const right = JSON.stringify(expected);
    if (left !== right) {
      console.error(`FAIL ${name}\n got ${left}\n want ${right}`);
      process.exitCode = 1;
    }
  };

  assert("task does not unlock", consentFromPrompt("На sign in убери логотип", locks, []), []);
  assert(
    "allow phrase unlocks",
    consentFromPrompt("разрешаю sign in", locks, []),
    ["src/app/register/register-screen.tsx"],
  );
  assert(
    "bare yes uses pending",
    consentFromPrompt("да", locks, ["src/app/register/register-screen.tsx"]),
    ["src/app/register/register-screen.tsx"],
  );
  assert("all screens stays locked", consentFromPrompt("Сделай сетку на всех экранах", locks, []), []);
  assert("question stays locked", consentFromPrompt("Покажи, как выглядит sign in", locks, []), []);
  assert("forbid stays locked", consentFromPrompt("Не трогай sign in, поправь событие", locks, []), []);

  const dir = fs.mkdtempSync(path.join("/tmp", "compass-lock-"));
  const previous = process.cwd();
  const locksCopy = fs.readFileSync(projectPath(".cursor/locks.txt"));
  process.chdir(dir);
  fs.mkdirSync(path.join(dir, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".cursor/locks.txt"), locksCopy);
  try {
    handle({ hook_event_name: "beforeSubmitPrompt", prompt: "Сетка на всех экранах" });
    assert(
      "edit denied",
      handle({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        tool_input: { path: "src/app/register/register-screen.tsx", old_string: "a", new_string: "b" },
      }).permission,
      "deny",
    );
    handle({ hook_event_name: "beforeSubmitPrompt", prompt: "да" });
    assert(
      "yes allows the stopped edit",
      handle({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        tool_input: { path: "src/app/register/register-screen.tsx", old_string: "a", new_string: "b" },
      }).permission,
      "allow",
    );
    handle({ hook_event_name: "beforeSubmitPrompt", prompt: "Поправь оплату события" });
    assert(
      "shell asks",
      handle({
        hook_event_name: "beforeShellExecution",
        command: "python3 -c \"open('src/app/register/register-screen.tsx','w').write('x')\"",
      }).permission,
      "ask",
    );
    assert(
      "diff allowed",
      handle({
        hook_event_name: "beforeShellExecution",
        command: "git diff -- src/app/register/register-screen.tsx",
      }).permission,
      "allow",
    );
    assert(
      "other file allowed",
      handle({
        hook_event_name: "preToolUse",
        tool_name: "StrReplace",
        tool_input: { path: "главный-экран/components/event-entry-screen.tsx", old_string: "a", new_string: "b" },
      }).permission,
      "allow",
    );
    assert(
      "consent write denied",
      handle({
        hook_event_name: "preToolUse",
        tool_name: "Write",
        tool_input: { path: ".cursor/locks/consent.json", contents: "{}" },
      }).permission,
      "deny",
    );
  } finally {
    process.chdir(previous);
  }

  if (process.exitCode) process.exit(process.exitCode);
  console.log("ok");
}

function start() {
  if (process.argv.includes("--self-test")) {
    runTests();
    return;
  }
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const input = raw.trim() ? JSON.parse(raw) : {};
      process.stdout.write(JSON.stringify(handle(input)));
    } catch {
      process.stdout.write(JSON.stringify({ permission: "allow", continue: true }));
    }
  });
}

start();
