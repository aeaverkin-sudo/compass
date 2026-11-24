/**
 * Throwaway database only. Does not connect to Supabase or production.
 * Two roles stand in for a normal account and a guest.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { Client, Pool } = require("pg");
const EmbeddedPostgres = require("embedded-postgres").default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "docs/phaseN-product-counts.sql"), "utf8");
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DAY = "2026-11-24";
const PORT = 54329;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connect(database) {
  const client = new Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database,
  });
  await client.connect();
  return client;
}

async function asRole(database, role, fn) {
  const client = await connect(database);
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

async function denied(database, role, statement) {
  const client = await connect(database);
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    let failed = false;
    try {
      await client.query(statement);
    } catch (error) {
      failed = /permission denied/i.test(error.message);
    }
    await client.query("rollback");
    assert(failed, `${role} was able to run ${statement}`);
  } finally {
    await client.end();
  }
}

const directory = await mkdtemp(path.join(tmpdir(), "aded-product-counts-"));
const postgres = new EmbeddedPostgres({
  databaseDir: directory,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: false,
});

try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("stats");
  const admin = await connect("stats");
  await admin.query(`
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
  `);
  await admin.query(sql);
  await admin.query("alter role service_role bypassrls");
  await admin.query("grant service_role to postgres");

  await admin.query("select bump_product_count($1::date, $2, $3::uuid, $4::uuid)", [DAY, "share_link", CARD, OWNER]);
  await admin.query("select bump_product_count($1::date, $2, null, null)", [DAY, "registration_email"]);

  const pool = new Pool({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database: "stats",
    max: 12,
  });
  try {
    await Promise.all(
      Array.from({ length: 24 }, () =>
        pool.query("select bump_product_count($1::date, $2, $3::uuid, $4::uuid)", [DAY, "open_qr", CARD, OWNER]),
      ),
    );
  } finally {
    await pool.end();
  }
  const share = await admin.query(
    "select total from product_daily_counts where action = 'share_link' and owner_id = $1",
    [OWNER],
  );
  const opens = await admin.query(
    "select total from product_daily_counts where action = 'open_qr' and owner_id = $1",
    [OWNER],
  );
  assert(Number(share.rows[0]?.total) === 1, `share total ${share.rows[0]?.total}`);
  assert(Number(opens.rows[0]?.total) === 24, `open total ${opens.rows[0]?.total}`);

  await denied("stats", "authenticated", "select * from product_daily_counts");
  await denied("stats", "anon", "select * from product_daily_counts");
  await denied("stats", "authenticated", "select * from product_count_objections");
  await denied("stats", "anon", "select * from product_count_objections");
  await denied("stats", "authenticated", `select bump_product_count('${DAY}'::date, 'open_other', '${CARD}'::uuid, '${OWNER}'::uuid)`);
  await denied("stats", "anon", `select object_to_product_counts('${OWNER}'::uuid)`);

  await admin.query("select object_to_product_counts($1::uuid)", [OWNER]);
  const gone = await admin.query("select count(*)::int as n from product_daily_counts where owner_id = $1", [OWNER]);
  const marked = await admin.query("select count(*)::int as n from product_count_objections where owner_id = $1", [OWNER]);
  assert(gone.rows[0].n === 0, "objection left linked totals");
  assert(marked.rows[0].n === 1, "objection mark missing");
  await admin.query("select bump_product_count($1::date, $2, $3::uuid, $4::uuid)", [DAY, "open_qr", CARD, OWNER]);
  await admin.query("select bump_product_count($1::date, $2, $3::uuid, $4::uuid)", [DAY, "share_link", CARD, OWNER]);
  const after = await admin.query("select count(*)::int as n from product_daily_counts where owner_id = $1", [OWNER]);
  assert(after.rows[0].n === 0, "a later open recreated the total");
  await admin.query("select bump_product_count($1::date, $2, $3::uuid, $4::uuid)", [DAY, "open_other", CARD, OTHER]);
  const other = await admin.query(
    "select total from product_daily_counts where action = 'open_other' and owner_id = $1",
    [OTHER],
  );
  assert(Number(other.rows[0]?.total) === 1, "another account was blocked");

  await admin.query(
    "insert into product_daily_counts (day, action, card_id, owner_id, total) values ($1::date, 'card_saved', null, null, 3)",
    ["2026-08-25"],
  );
  await admin.query("delete from product_daily_counts where day < $1::date", ["2026-08-26"]);
  const old = await admin.query("select count(*)::int as n from product_daily_counts where day < $1::date", ["2026-08-26"]);
  const kept = await admin.query("select count(*)::int as n from product_daily_counts where action = 'registration_email'");
  assert(old.rows[0].n === 0, "old total was kept");
  assert(kept.rows[0].n === 1, "a current total was deleted");

  const operator = await asRole("stats", "service_role", async (client) => {
    const seen = await client.query("select count(*)::int as n from product_daily_counts");
    return seen.rows[0].n;
  });
  assert(operator > 0, "operator could not read the totals");

  await admin.end();
  console.log("scenario ok: account and guest cannot read, objection sticks, parallel opens summed, old rows deleted");
} finally {
  await postgres.stop().catch(() => undefined);
  await rm(directory, { recursive: true, force: true });
}
