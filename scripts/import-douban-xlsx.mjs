/**
 * 一次性：把豆伴 Excel 的「看过 / 想看」按标题+年份匹配 TMDB，写入本地库。
 * 不访问豆瓣。用法：node scripts/import-douban-xlsx.mjs [xlsx路径]
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(path.join(root, "local", ".env"));

const DATABASE_URL = "file:" + path.join(root, "local", "dev.db").replaceAll("\\", "/");
process.env.DATABASE_URL = DATABASE_URL;

const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const MANUAL_SOURCE = "manual";
const SHEETS = [
  { file: "sheet1.xml", status: "done" },
  { file: "sheet3.xml", status: "wishlist" },
];

const apiKey = (process.env.TMDB_API_KEY ?? "").trim();
if (!apiKey) {
  console.error("未配置 TMDB_API_KEY（local/.env）");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSheet(xml) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = rowRe.exec(xml))) {
    const cells = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let c;
    while ((c = cellRe.exec(m[2]))) {
      const v = c[4].match(/<v>([\s\S]*?)<\/v>/);
      cells[c[1]] = v ? decode(v[1]) : "";
    }
    rows.push(cells);
  }
  return rows;
}

function extractXlsx(xlsxPath) {
  const dir = mkdtempSync(path.join(tmpdir(), "douban-xlsx-"));
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(xlsxPath)}, ${JSON.stringify(dir)})`,
    ],
    { stdio: "pipe" },
  );
  return dir;
}

function yearFromIntro(intro) {
  const m = String(intro || "").match(/^(\d{4})\b/);
  return m ? Number(m[1]) : null;
}

function dateFromCreated(raw) {
  const m = String(raw || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normTitle(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[·•・.\s：:：''""「」『』《》()（）\[\]【】!?！？,，]/g, "");
}

function parseReviewAndRating(starsRaw, reviewRaw) {
  const stars = Number(starsRaw);
  const starRating =
    Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars * 2 : null;
  const text = String(reviewRaw || "").trim();
  if (!text) return { rating: starRating, review: null };

  const onlyScore = text.match(/^(\d(?:\.\d)?)[+-]?$/);
  if (onlyScore) {
    const n = Number(onlyScore[1]);
    if (n >= 0 && n <= 10) return { rating: Math.round(n), review: null };
  }

  const fenPrefix = text.match(/^(\d(?:\.\d)?)分[，,]\s*(.*)$/);
  if (fenPrefix) {
    const n = Number(fenPrefix[1]);
    const rest = fenPrefix[2].trim();
    if (n >= 0 && n <= 10) {
      return { rating: Math.round(n), review: rest || null };
    }
  }

  return { rating: starRating, review: text };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbGet(apiPath, params = {}) {
  const url = new URL(`https://api.tmdb.org/3${apiPath}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "zh-CN");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let lastErr;
  for (let i = 0; i < 4; i++) {
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (err) {
      lastErr = err;
      await sleep(800 * (i + 1));
      continue;
    }
    if (res.status === 429) {
      await sleep(1500 * (i + 1));
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data && typeof data === "object" && data.status_message
          ? String(data.status_message)
          : `TMDB ${res.status}`,
      );
    }
    return data;
  }
  throw lastErr instanceof Error ? lastErr : new Error("连不上 TMDB");
}

function hitYear(row, kind) {
  const date = kind === "tv" ? row.first_air_date : row.release_date;
  if (!date) return null;
  const y = Number.parseInt(String(date).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

function scoreHit(query, year, row, kind) {
  const title = row.title || row.name || row.original_title || row.original_name || "";
  const original = row.original_title || row.original_name || "";
  const q = normTitle(query);
  const t = normTitle(title);
  const o = normTitle(original);
  let titleScore = 0;
  if (t === q || o === q) titleScore = 3;
  else if (t.includes(q) || q.includes(t) || (o && (o.includes(q) || q.includes(o)))) titleScore = 1;
  if (titleScore === 0) return -1;
  let s = titleScore * 10;
  const hy = hitYear(row, kind);
  if (year && hy) {
    const d = Math.abs(hy - year);
    if (d === 0) s += 5;
    else if (d === 1) s += 2;
    else s -= Math.min(d, 8);
  }
  return s;
}

function pickBest(query, year, movieRows, tvRows) {
  const candidates = [
    ...movieRows.map((row) => ({ kind: "movie", row, score: scoreHit(query, year, row, "movie") })),
    ...tvRows.map((row) => ({ kind: "tv", row, score: scoreHit(query, year, row, "tv") })),
  ].filter((c) => c.score >= 10);
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const q = normTitle(query);
  const title = best.row.title || best.row.name || "";
  const original = best.row.original_title || best.row.original_name || "";
  const exact = normTitle(title) === q || normTitle(original) === q;
  const hy = hitYear(best.row, best.kind);
  const yearOk = !year || (hy != null && Math.abs(hy - year) <= 1);
  if (!exact && !yearOk) return null;
  if (!exact && best.score < 15) return null;
  return best;
}

function namesOf(rows, max = 0) {
  const names = (rows ?? []).map((r) => String(r.name ?? "").trim()).filter(Boolean);
  return max > 0 ? names.slice(0, max) : names;
}

function extraJsonOf(extra) {
  return Object.values(extra).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ""))
    ? JSON.stringify(extra)
    : null;
}

async function getDetail(kind, id) {
  if (kind === "movie") {
    const movie = await tmdbGet(`/movie/${id}`, { append_to_response: "credits" });
    const title = movie.title || movie.original_title || "未命名";
    const originalTitle =
      movie.original_title && movie.original_title !== title ? movie.original_title : null;
    const directors = (movie.credits?.crew ?? [])
      .filter((c) => c.job === "Director")
      .map((c) => String(c.name ?? "").trim())
      .filter(Boolean);
    return {
      type: "movie",
      source: "tmdb",
      sourceId: String(movie.id),
      title,
      originalTitle,
      year: hitYear(movie, "movie"),
      coverUrl: movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : null,
      description: movie.overview || null,
      extraJson: extraJsonOf({
        genres: namesOf(movie.genres),
        directors,
        cast: namesOf(movie.credits?.cast, 6),
        countries: namesOf(movie.production_countries),
        languages: namesOf(movie.spoken_languages),
        runtime: movie.runtime ?? null,
        releaseDate: movie.release_date || null,
        imdbId: movie.imdb_id || null,
      }),
    };
  }
  const show = await tmdbGet(`/tv/${id}`, { append_to_response: "credits" });
  const title = show.name || show.original_name || "未命名";
  const originalTitle =
    show.original_name && show.original_name !== title ? show.original_name : null;
  return {
    type: "tv",
    source: "tmdb",
    sourceId: String(show.id),
    title,
    originalTitle,
    year: hitYear(show, "tv"),
    coverUrl: show.poster_path ? `${IMAGE_BASE}${show.poster_path}` : null,
    description: show.overview || null,
    extraJson: extraJsonOf({
      genres: namesOf(show.genres),
      creators: namesOf(show.created_by),
      cast: namesOf(show.credits?.cast, 6),
      countries: namesOf(show.production_countries).length
        ? namesOf(show.production_countries)
        : (show.origin_country ?? []).filter(Boolean),
      languages: namesOf(show.spoken_languages),
      runtime: show.episode_run_time?.[0] ?? null,
      seasons: show.number_of_seasons ?? null,
      episodes: show.number_of_episodes ?? null,
      firstAirDate: show.first_air_date || null,
    }),
  };
}

function findExisting(items, title, year) {
  const q = normTitle(title);
  const sameTitle = items.filter((it) => normTitle(it.title) === q || normTitle(it.originalTitle) === q);
  if (year != null) {
    const byYear = sameTitle.filter((it) => it.year === year);
    if (byYear.length === 1) return byYear[0];
    if (byYear.length > 1) return byYear[0];
  }
  if (sameTitle.length === 1) return sameTitle[0];
  return null;
}

function entryDates(status, markedOn) {
  if (status === "done") return { wishlistOn: null, startedOn: null, finishedOn: markedOn };
  return { wishlistOn: markedOn, startedOn: null, finishedOn: null };
}

async function writeEntry(itemId, status, rating, review, markedOn) {
  const dates = entryDates(status, markedOn);
  // 当前生成的 client 还不带 wishlistOn，日期列用 SQL 写
  await prisma.entry.upsert({
    where: { itemId },
    create: {
      itemId,
      status,
      rating,
      review,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
    update: {
      status,
      rating,
      review,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
  });
  await prisma.$executeRaw`
    UPDATE entries SET wishlist_on = ${dates.wishlistOn} WHERE item_id = ${itemId}
  `;
}

async function upsertFromSnap(snap, status, rating, review, markedOn, existing) {
  if (existing) {
    const data = {
      title: snap.title,
      originalTitle: snap.originalTitle,
      year: snap.year,
    };
    if (snap.coverUrl !== undefined) data.coverUrl = snap.coverUrl;
    if (snap.description !== undefined) data.description = snap.description;
    if (snap.extraJson !== undefined) data.extraJson = snap.extraJson;
    await prisma.item.update({ where: { id: existing.id }, data });
    await writeEntry(existing.id, status, rating, review, markedOn);
    existing.title = snap.title;
    existing.originalTitle = snap.originalTitle;
    existing.year = snap.year;
    existing.source = snap.source;
    existing.sourceId = snap.sourceId;
    existing.type = snap.type;
    return existing.id;
  }
  const item = await prisma.item.upsert({
    where: {
      type_source_sourceId: {
        type: snap.type,
        source: snap.source,
        sourceId: snap.sourceId,
      },
    },
    create: {
      type: snap.type,
      source: snap.source,
      sourceId: snap.sourceId,
      title: snap.title,
      originalTitle: snap.originalTitle,
      year: snap.year,
      coverUrl: snap.coverUrl,
      description: snap.description,
      extraJson: snap.extraJson,
    },
    update: {
      title: snap.title,
      originalTitle: snap.originalTitle,
      year: snap.year,
      coverUrl: snap.coverUrl,
      description: snap.description,
      extraJson: snap.extraJson,
    },
  });
  await writeEntry(item.id, status, rating, review, markedOn);
  return item.id;
}

async function main() {
  const xlsxPath = path.resolve(process.argv[2] || path.join(root, "豆伴(184742209).xlsx"));
  console.log("读取", xlsxPath);
  const dir = extractXlsx(xlsxPath);
  const rows = [];
  try {
    for (const sheet of SHEETS) {
      const xml = readFileSync(path.join(dir, "xl", "worksheets", sheet.file), "utf8");
      for (const r of parseSheet(xml).slice(1)) {
        if (!r.A) continue;
        rows.push({
          title: r.A.trim(),
          intro: r.B || "",
          year: yearFromIntro(r.B),
          status: sheet.status,
          markedOn: dateFromCreated(r.E),
          ...parseReviewAndRating(r.F, r.H),
        });
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // 同一部出现在想看和看过时，看过优先
  const byKey = new Map();
  for (const row of rows) {
    const key = `${normTitle(row.title)}|${row.year ?? ""}`;
    const prev = byKey.get(key);
    if (!prev || (prev.status !== "done" && row.status === "done")) byKey.set(key, row);
  }
  const list = [...byKey.values()];
  console.log(`表格影视 ${rows.length} 行，去重后 ${list.length}`);

  const items = await prisma.item.findMany({
    where: { type: { in: ["movie", "tv"] } },
    select: { id: true, type: true, source: true, sourceId: true, title: true, originalTitle: true, year: true },
  });

  const report = { updated: [], created: [], manual: [], unmatched: [], errors: [] };
  let i = 0;
  for (const row of list) {
    i += 1;
    if (i % 20 === 0 || i === 1) console.log(`进度 ${i}/${list.length} ${row.title}`);
    try {
      const existing = findExisting(items, row.title, row.year);
      if (existing && existing.source === "tmdb") {
        // 已有 TMDB 快照：只改自己的记录，不重新拉网
        await writeEntry(existing.id, row.status, row.rating, row.review, row.markedOn);
        report.updated.push(row.title);
        continue;
      }

      const movieData = await tmdbGet("/search/movie", { query: row.title });
      await sleep(120);
      let tvData = { results: [] };
      const movieHit = pickBest(row.title, row.year, movieData.results ?? [], []);
      if (!movieHit || movieHit.score < 35) {
        tvData = await tmdbGet("/search/tv", { query: row.title });
        await sleep(120);
      }
      const hit = pickBest(row.title, row.year, movieData.results ?? [], tvData.results ?? []);
      if (!hit) {
        const snap = {
          type: "movie",
          source: MANUAL_SOURCE,
          sourceId: crypto.randomUUID(),
          title: row.title,
          originalTitle: null,
          year: row.year,
          coverUrl: null,
          description: row.intro || null,
          extraJson: null,
        };
        const id = await upsertFromSnap(
          snap,
          row.status,
          row.rating,
          row.review,
          row.markedOn,
          existing && existing.source === MANUAL_SOURCE ? existing : null,
        );
        items.push({
          id,
          type: snap.type,
          source: snap.source,
          sourceId: snap.sourceId,
          title: snap.title,
          originalTitle: null,
          year: snap.year,
        });
        report.manual.push({ title: row.title, year: row.year });
        continue;
      }

      await sleep(120);
      const snap = await getDetail(hit.kind, hit.row.id);
      const already = items.find(
        (it) => it.type === snap.type && it.source === snap.source && it.sourceId === snap.sourceId,
      );
      const id = await upsertFromSnap(snap, row.status, row.rating, row.review, row.markedOn, already ?? existing);
      if (already || existing) report.updated.push(row.title);
      else {
        report.created.push({ title: snap.title, type: snap.type, tmdb: snap.sourceId });
        items.push({
          id,
          type: snap.type,
          source: snap.source,
          sourceId: snap.sourceId,
          title: snap.title,
          originalTitle: snap.originalTitle,
          year: snap.year,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.errors.push({ title: row.title, message });
      console.error("失败", row.title, message);
    }
  }

  const out = path.join(root, "local", "import-douban-report.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        file: xlsxPath,
        at: new Date().toISOString(),
        counts: {
          rows: list.length,
          updated: report.updated.length,
          created: report.created.length,
          manual: report.manual.length,
          errors: report.errors.length,
        },
        manual: report.manual,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `完成：更新 ${report.updated.length}，新建 ${report.created.length}，手动 ${report.manual.length}，失败 ${report.errors.length}`,
  );
  console.log("报告", out);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
