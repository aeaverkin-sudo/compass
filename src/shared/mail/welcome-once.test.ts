import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAppMetadata,
  appMetadataPatch,
  classifyWelcomeFailure,
  deliverWelcome,
  WELCOME_KEY_MS,
  welcomeIdempotencyKey,
  welcomeVariant,
  type WelcomePost,
} from "./welcome-once.ts";

const KEY = welcomeIdempotencyKey("user-1");

function gate(now = 1_700_000_000_000) {
  let metadata: Record<string, unknown> = {};
  let deliveries = 0;
  let failMark = false;
  let mode: "accept" | "refuse" | "timeout" = "accept";
  const stored = new Map<string, { id: string; at: number }>();
  const flying = new Set<string>();
  const pending: (() => void)[] = [];
  let hold = false;
  return {
    metadata: () => metadata,
    deliveries: () => deliveries,
    setNow(value: number) {
      now = value;
    },
    now: () => now,
    failMark(value: boolean) {
      failMark = value;
    },
    refuse(value: boolean) {
      mode = value ? "refuse" : "accept";
    },
    timeout() {
      mode = "timeout";
    },
    holdNext() {
      hold = true;
    },
    waiting() {
      return pending.length;
    },
    release() {
      const resume = pending.shift();
      if (resume) resume();
    },
    async read() {
      return { email: "person@example.com", metadata: { ...metadata } };
    },
    async write(recipe: (current: Record<string, unknown>) => Record<string, unknown>) {
      const next = recipe(metadata);
      const patch = appMetadataPatch(metadata, next);
      if (!patch) return true;
      if (failMark && !metadata.welcome_mail_at && patch.welcome_mail_at) return false;
      metadata = applyAppMetadata(metadata, patch);
      return true;
    },
    async send(key: string): Promise<WelcomePost> {
      if (mode === "refuse") return classifyWelcomeFailure("validation_error");
      if (mode === "timeout") {
        if (!stored.has(key)) {
          deliveries += 1;
          stored.set(key, { id: `mail_${deliveries}`, at: now });
        }
        throw new Error("timeout");
      }
      const prior = stored.get(key);
      if (prior && now - prior.at < WELCOME_KEY_MS) return { accepted: true, id: prior.id };
      if (flying.has(key)) return { accepted: false, inFlight: true };
      flying.add(key);
      if (hold) {
        hold = false;
        await new Promise<void>((resolve) => pending.push(resolve));
      }
      deliveries += 1;
      const id = `mail_${deliveries}`;
      stored.set(key, { id, at: now });
      flying.delete(key);
      return { accepted: true, id };
    },
  };
}

function run(world: ReturnType<typeof gate>, claim?: Record<string, string>) {
  assert.ok(KEY);
  return deliverWelcome({
    now: world.now(),
    key: KEY,
    ...(claim ? { claim } : {}),
    read: world.read,
    write: world.write,
    send: world.send,
  });
}

test("two overlapping welcomes produce one Resend acceptance", async () => {
  const world = gate();
  world.holdNext();
  const first = run(world);
  for (let tick = 0; tick < 20 && world.waiting() === 0; tick += 1) await Promise.resolve();
  assert.equal(world.waiting(), 1);
  const second = run(world);
  for (let tick = 0; tick < 20 && world.deliveries() === 0 && world.waiting() === 1; tick += 1) await Promise.resolve();
  world.release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(world.deliveries(), 1);
  assert.ok(a === "sent" || b === "sent");
  assert.ok([a, b].every((step) => step === "sent" || step === "busy" || step === "skipped"));
  assert.equal(typeof world.metadata().welcome_mail_at, "string");
  assert.equal(world.metadata().welcome_resend_id, "mail_1");
});

test("a refusal before Resend accepts leaves no sent mark", async () => {
  const world = gate();
  world.refuse(true);
  assert.equal(await run(world), "refused");
  assert.equal(world.metadata().welcome_mail_at, undefined);
  assert.equal(world.metadata().welcome_claim_at, undefined);
  assert.equal(world.deliveries(), 0);
  world.refuse(false);
  assert.equal(await run(world), "sent");
  assert.equal(world.deliveries(), 1);
});

test("a retry after a lost mark reads the first Resend result until the key expires", async () => {
  const world = gate();
  world.failMark(true);
  assert.equal(await run(world), "unmarked");
  assert.equal(world.deliveries(), 1);
  assert.equal(world.metadata().welcome_mail_at, undefined);
  assert.equal(typeof world.metadata().welcome_claim_at, "string");
  world.failMark(false);
  assert.equal(await run(world), "sent");
  assert.equal(world.deliveries(), 1);
  assert.equal(world.metadata().welcome_resend_id, "mail_1");

  const expired = gate();
  await expired.write(() => ({ welcome_claim_at: new Date(expired.now() - WELCOME_KEY_MS).toISOString() }));
  assert.equal(await run(expired), "expired");
  assert.equal(expired.deliveries(), 0);
  assert.equal(WELCOME_KEY_MS, 24 * 60 * 60 * 1000);
});

test("a confirmed refusal clears the claim and leaves the other app_metadata", async () => {
  const world = gate();
  await world.write(() => ({ provider: "email", role: "owner" }));
  world.refuse(true);
  assert.equal(await run(world), "refused");
  assert.equal(world.metadata().welcome_mail_at, undefined);
  assert.equal(world.metadata().welcome_claim_at, undefined);
  assert.equal(world.metadata().provider, "email");
  assert.equal(world.metadata().role, "owner");
  assert.equal(world.deliveries(), 0);
});

test("a timeout keeps the claim, and a later portfolio retries the first result", async () => {
  const world = gate();
  world.timeout();
  assert.equal(await run(world, { welcome_claim_portfolio: "0" }), "unknown");
  assert.equal(world.deliveries(), 1);
  assert.equal(world.metadata().welcome_mail_at, undefined);
  assert.equal(typeof world.metadata().welcome_claim_at, "string");
  assert.equal(world.metadata().welcome_claim_portfolio, "0");
  assert.equal(welcomeVariant(world.metadata(), true), false);
  world.refuse(false);
  assert.equal(await run(world), "sent");
  assert.equal(world.deliveries(), 1);
  assert.equal(world.metadata().welcome_resend_id, "mail_1");
  assert.equal(await run(world), "skipped");
  assert.equal(world.deliveries(), 1);
});
