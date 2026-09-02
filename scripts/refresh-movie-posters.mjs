/**
 * 已入库电影：封面改成地区语言海报，没有再英文。
 * node scripts/refresh-movie-posters.mjs
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
const COUNTRY_POSTER_LANG = {
  CN: "zh",
  HK: "zh",
  TW: "zh",
  JP: "ja",
  KR: "ko",
  FR: "fr",
  DE: "de",
  ES: "es",
  MX: "es",
  AR: "es",
  IT: "it",
  BR: "pt",
  PT: "pt",
  RU: "ru",
  TH: "th",
  IN: "hi",
  SE: "sv",
  DK: "da",
  NO: "no",
  NL: "nl",
  PL: "pl",
  CZ: "cs",
  HU: "hu",
  TR: "tr",
  VN: "vi",
  ID: "id",
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

function normPosterLang(code) {
  if (!code) return null;
  const c = String(code).toLowerCase();
  if (c === "cn" || c.startsWith("zh")) return "zh";
  return c;
}

function regionLangs(movie) {
  const out = [];
  const add = (lang) => {
    if (!lang || out.includes(lang)) return;
    out.push(lang);
  };
  add(normPosterLang(movie.original_language));
  for (const country of movie.production_countries ?? []) {
    add(normPosterLang(COUNTRY_POSTER_LANG[country.iso_3166_1]));
  }
  return out;
}

function bestPath(posters, lang) {
  const hits = (posters ?? []).filter((p) => p.file_path && (p.iso_639_1 ?? null) === lang);
  if (!hits.length) return null;
  hits.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
  return hits[0].file_path;
}

function pickPoster(movie) {
  const posters = movie.images?.posters;
  for (const lang of regionLangs(movie)) {
    if (lang === "en") continue;
    const file = bestPath(posters, lang);
    if (file) return file;
  }
  return bestPath(posters, "en") || movie.poster_path || bestPath(posters, null) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbMovie(id) {
  const url = new URL(`https://api.tmdb.org/3/movie/${id}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("append_to_response", "images");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const items = await prisma.item.findMany({
  where: { type: "movie", source: "tmdb" },
  select: { id: true, sourceId: true, title: true, coverUrl: true },
});

let changed = 0;
let failed = 0;
let i = 0;
for (const item of items) {
  i += 1;
  try {
    const movie = await tmdbMovie(item.sourceId);
    const file = pickPoster(movie);
    const coverUrl = file ? `${IMAGE_BASE}${file}` : item.coverUrl;
    if (coverUrl && coverUrl !== item.coverUrl) {
      await prisma.item.update({ where: { id: item.id }, data: { coverUrl } });
      changed += 1;
    }
    if (i % 40 === 0) console.log(`进度 ${i}/${items.length} 已换 ${changed}`);
  } catch (err) {
    failed += 1;
    console.error("失败", item.title, err instanceof Error ? err.message : err);
  }
  await sleep(120);
}

console.log(`完成：检查 ${items.length}，换封面 ${changed}，失败 ${failed}`);
await prisma.$disconnect();
