/**
 * 待整理（source=manual 的电影/剧）再对一遍 TMDB。
 * 搜索时去掉「第X季」；对上已有条目就合并记录。
 * node scripts/rematch-inbox.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(path.join(root, "local", ".env"));
const DATABASE_URL = "file:" + path.join(root, "local", "dev.db").replaceAll("\\", "/");
const apiKey = (process.env.TMDB_API_KEY ?? "").trim();
if (!apiKey) {
  console.error("未配置 TMDB_API_KEY");
  process.exit(1);
}

const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const GENRE_ZH = {
  "Sci-Fi & Fantasy": "科幻",
  "Action & Adventure": "动作冒险",
  "War & Politics": "战争",
};
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

function normTitle(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[·•・.\s：:：''""「」『』《》()（）\[\]【】!?！？,，]/g, "");
}

function stripSeason(title) {
  return String(title || "")
    .replace(/[＊*]+/g, "")
    .replace(/\s*第[0-9一二三四五六七八九十两]+季.*$/u, "")
    .replace(/\s*\(\s*短片\s*\)\s*$/u, "")
    .replace(/\s*\d+$/u, "")
    .trim();
}

function searchQueries(title) {
  const out = [];
  const add = (s) => {
    const t = String(s || "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(title);
  add(title.replace(/[＊*]+/g, ""));
  add(stripSeason(title));
  return out;
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

function scoreHit(query, year, row, kind, looseYear) {
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
    const slack = looseYear && kind === "tv" ? 15 : 1;
    if (d === 0) s += 5;
    else if (d <= slack) s += looseYear && kind === "tv" ? 2 : d === 1 ? 2 : 0;
    else s -= Math.min(d, 8);
  }
  if (kind === "tv" && /第[0-9一二三四五六七八九十两]+季/.test(query)) s += 3;
  return s;
}

function pickBest(query, year, movieRows, tvRows, looseYear) {
  const candidates = [
    ...movieRows.map((row) => ({ kind: "movie", row, score: scoreHit(query, year, row, "movie", looseYear) })),
    ...tvRows.map((row) => ({ kind: "tv", row, score: scoreHit(query, year, row, "tv", looseYear) })),
  ].filter((c) => c.score >= 10);
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const q = normTitle(query);
  const title = best.row.title || best.row.name || "";
  const original = best.row.original_title || best.row.original_name || "";
  const exact = normTitle(title) === q || normTitle(original) === q;
  const hy = hitYear(best.row, best.kind);
  const slack = looseYear && best.kind === "tv" ? 15 : 1;
  const yearOk = !year || (hy != null && Math.abs(hy - year) <= slack);
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
    const movie = await tmdbGet(`/movie/${id}`, { append_to_response: "credits,images" });
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
        genres: namesOf(movie.genres).map((g) => GENRE_ZH[g] ?? g),
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
      genres: namesOf(show.genres).map((g) => GENRE_ZH[g] ?? g),
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

function minDate(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.reduce((p, c) => (c < p ? c : p));
}

function maxDate(a, b) {
  const xs = [a, b].filter(Boolean);
  if (!xs.length) return null;
  return xs.reduce((p, c) => (c > p ? c : p));
}

function mergeStatus(a, b) {
  if (a === b) return a;
  const pair = new Set([a, b]);
  if (pair.has("done") && (pair.has("wishlist") || pair.has("in_progress"))) return "in_progress";
  const rank = { dropped: 0, wishlist: 1, in_progress: 2, done: 3 };
  return (rank[b] ?? 0) > (rank[a] ?? 0) ? b : a;
}

async function applySnap(item, snap) {
  const clash = await prisma.item.findFirst({
    where: {
      type: snap.type,
      source: "tmdb",
      sourceId: snap.sourceId,
      NOT: { id: item.id },
    },
    include: { entry: true },
  });

  const incoming = item.entry;
  if (clash) {
    if (incoming && clash.entry) {
      await prisma.entry.update({
        where: { itemId: clash.id },
        data: {
          status: mergeStatus(clash.entry.status, incoming.status),
          rating: clash.entry.rating ?? incoming.rating,
          review: clash.entry.review || incoming.review,
          wishlistOn: minDate(clash.entry.wishlistOn, incoming.wishlistOn),
          startedOn: minDate(clash.entry.startedOn, incoming.startedOn),
          finishedOn: maxDate(clash.entry.finishedOn, incoming.finishedOn),
        },
      });
    } else if (incoming && !clash.entry) {
      await prisma.entry.update({
        where: { itemId: incoming.itemId },
        data: { itemId: clash.id },
      });
    }
    await prisma.item.delete({ where: { id: item.id } });
    return { action: "merge", title: clash.title, dest: clash.id };
  }

  await prisma.item.update({
    where: { id: item.id },
    data: {
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
  });
  return { action: "update", title: snap.title };
}

const items = await prisma.item.findMany({
  where: { source: "manual", type: { in: ["movie", "tv"] } },
  include: { entry: true },
  orderBy: { id: "asc" },
});

let matched = 0;
let merged = 0;
let leftover = 0;
let failed = 0;
let i = 0;
for (const item of items) {
  i += 1;
  const queries = searchQueries(item.title);
  const looseYear = queries.length > 1 || /第[0-9一二三四五六七八九十两]+季/.test(item.title);
  try {
    let movieRows = [];
    let tvRows = [];
    const seenMovie = new Set();
    const seenTv = new Set();
    for (const q of queries) {
      const movieData = await tmdbGet("/search/movie", { query: q });
      await sleep(120);
      const tvData = await tmdbGet("/search/tv", { query: q });
      await sleep(120);
      for (const row of movieData.results ?? []) {
        if (!seenMovie.has(row.id)) {
          seenMovie.add(row.id);
          movieRows.push(row);
        }
      }
      for (const row of tvData.results ?? []) {
        if (!seenTv.has(row.id)) {
          seenTv.add(row.id);
          tvRows.push(row);
        }
      }
    }

    let hit = null;
    for (const q of queries) {
      const cand = pickBest(q, item.year, movieRows, tvRows, looseYear);
      if (!cand) continue;
      if (!hit || cand.score > hit.score) hit = cand;
    }
    if (!hit) {
      leftover += 1;
      console.log(`留 ${item.title}`);
      continue;
    }

    const snap = await getDetail(hit.kind, hit.row.id);
    await sleep(120);
    const result = await applySnap(item, snap);
    if (result.action === "merge") {
      merged += 1;
      console.log(`合并 ${item.title} → #${result.dest} ${result.title}`);
    } else {
      matched += 1;
      console.log(`对上 ${item.title} → ${snap.type} ${snap.title}`);
    }
  } catch (err) {
    failed += 1;
    console.error("失败", item.title, err instanceof Error ? err.message : err);
  }
  if (i % 10 === 0) console.log(`进度 ${i}/${items.length}`);
}

console.log(`完成：${items.length} 条，对上 ${matched}，合并 ${merged}，留下 ${leftover}，失败 ${failed}`);
await prisma.$disconnect();
