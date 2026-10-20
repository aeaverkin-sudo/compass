import { readdir, readFile } from "node:fs/promises";
import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { loadEventInvite } from "@/shared/services/event-invite";

export const POSTER_BUCKET = "event-posters";

const WIDTH = 286;
const HEIGHT = 404;
const SCALE = 3;
const TIMEOUT_MS = 15_000;

/** The running server itself: the sheet is rendered from here, not over the public internet. */
function sheetOrigin(): string {
  const own = process.env.POSTER_SHEET_ORIGIN?.trim().replace(/\/$/, "");
  if (own) return own;
  return `http://127.0.0.1:${process.env.PORT?.trim() || "3000"}`;
}

/** Resident memory of Chromium and its children, in MB. Linux only; elsewhere null. */
async function chromiumRssMb(pid: number | undefined): Promise<number | null> {
  if (!pid || process.platform !== "linux") return null;
  const seen = new Set<number>();
  const walk = async (id: number): Promise<number> => {
    if (seen.has(id)) return 0;
    seen.add(id);
    let kb = 0;
    try {
      const status = await readFile(`/proc/${id}/status`, "utf8");
      kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
      for (const task of await readdir(`/proc/${id}/task`)) {
        const children = (await readFile(`/proc/${id}/task/${task}/children`, "utf8").catch(() => "")).trim();
        for (const child of children ? children.split(/\s+/) : []) kb += await walk(Number(child));
      }
    } catch {
      return kb;
    }
    return kb;
  };
  return Math.round((await walk(pid)) / 1024);
}

async function launch() {
  const { default: puppeteer } = await import("puppeteer-core");
  const local = process.env.CHROMIUM_PATH?.trim();
  if (local) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  const { default: chromium } = await import("@sparticuz/chromium");
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: "shell",
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
  });
}

/** The live InviteCover at 286×404, three times over: an 858×1212 PNG. */
async function renderSheet(code: string): Promise<{ png: Buffer; chromiumMb: number | null }> {
  const origin = sheetOrigin();
  const browser = await withTimeout(launch());
  try {
    return await withTimeout(shoot(browser, origin, code));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function shoot(browser: Awaited<ReturnType<typeof launch>>, origin: string, code: string) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:")) return void request.continue();
    if (!url.startsWith(`${origin}/`) || new URL(url).pathname.startsWith("/api/")) return void request.abort();
    void request.continue();
  });
  await page.goto(`${origin}/e/${encodeURIComponent(code)}/poster-sheet`, { waitUntil: "networkidle0", timeout: TIMEOUT_MS });
  await page.waitForFunction(
    (width) => {
      const sheet = document.querySelector("[data-poster-sheet]");
      const cover = sheet?.querySelector("[style*='scale(']");
      return Boolean(cover && Math.abs(cover.getBoundingClientRect().width - width) < 1);
    },
    { timeout: TIMEOUT_MS },
    WIDTH,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => (image.complete ? image.decode().catch(() => undefined) : new Promise((done) => {
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      }))),
    );
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  const chromiumMb = await chromiumRssMb(browser.process()?.pid);
  const shot = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  return { png: Buffer.from(shot), chromiumMb };
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("poster_timeout")), TIMEOUT_MS)),
  ]);
}

async function snapshot(lookup: string): Promise<void> {
  const event = await loadEventInvite(lookup);
  if (!event) return;
  const started = Date.now();
  const { png, chromiumMb } = await renderSheet(event.code);
  const admin = createAdminSupabaseClient();
  const previous = await admin.from("events").select("poster_path").eq("id", event.id).maybeSingle();
  const previousPath = (previous.data as { poster_path?: string | null } | null)?.poster_path ?? null;
  const stamp = new Date().toISOString();
  const path = `${event.id}-${stamp}.png`;
  const stored = await admin.storage.from(POSTER_BUCKET).upload(path, png, { contentType: "image/png", upsert: true, cacheControl: "300" });
  if (stored.error) throw new Error(stored.error.message);
  const saved = await admin.from("events").update({ poster_path: path, poster_updated_at: stamp }).eq("id", event.id);
  if (!saved.error && previousPath && previousPath !== path) {
    await admin.storage.from(POSTER_BUCKET).remove([previousPath]);
  }
  if (saved.error) throw new Error(saved.error.message);
  const nodeMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.info(`[poster] ${event.id} ${png.length} bytes in ${Date.now() - started} ms · chromium ${chromiumMb ?? "?"} MB · node ${nodeMb} MB`);
}

let queue: Promise<void> = Promise.resolve();

/** One render at a time. A failure keeps the previous snapshot; the mail falls back to the OG image. */
export function queuePosterSnapshot(lookup: string): Promise<void> {
  queue = queue.then(() =>
    snapshot(lookup).catch((error: unknown) => {
      console.error("[poster] snapshot", lookup, error instanceof Error ? error.message : error);
    }),
  );
  return queue;
}

/** The stored snapshot for a mail, with its time so a new render is a new address. */
export function posterUrl(path: string | null | undefined, updatedAt: string | null | undefined): string | null {
  if (!path) return null;
  const admin = createAdminSupabaseClient();
  const url = admin.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl;
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return version > 0 ? `${url}?v=${version}` : url;
}

/** The snapshot itself, or null when there is none yet or the bucket does not answer. */
export async function loadPosterBytes(eventId: string): Promise<Buffer | null> {
  const path = await loadPosterPath(eventId);
  if (!path) return null;
  const admin = createAdminSupabaseClient();
  const loaded = await admin.storage.from(POSTER_BUCKET).download(path);
  if (loaded.error || !loaded.data) return null;
  return Buffer.from(await loaded.data.arrayBuffer());
}

/** The stored poster of this event, or null before the first snapshot or the poster migration. */
export async function loadPosterPath(eventId: string): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const loaded = await admin.from("events").select("poster_path").eq("id", eventId).maybeSingle();
  if (loaded.error) return null;
  return (loaded.data as { poster_path?: string | null } | null)?.poster_path ?? null;
}
