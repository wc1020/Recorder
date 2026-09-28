/**
 * 一次性：用国家图书馆 OPAC 补全本地图书元数据（仿 NLCISBNPlugin）。
 * 有 ISBN 先按 ISBN；没有或失败再按书名。国图无封面，不改 coverUrl。
 *
 * 用法：
 *   node scripts/enrich-books-nlc.mjs --dry-run
 *   node scripts/enrich-books-nlc.mjs
 *   node scripts/enrich-books-nlc.mjs --id=19
 */
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_URL = "file:" + path.join(root, "local", "dev.db").replaceAll("\\", "/");
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const BASE = "http://opac.nlc.cn/F";
const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
const SLEEP_MS = 1500;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const idArg = args.find((a) => a.startsWith("--id="));
const onlyId = idArg ? Number(idArg.slice(5)) : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s（）()\[\]【】·・.,，。:：;；"'“”‘’]/g, "")
    .replace(/第.版|修订本|珍藏版|典藏版/g, "");
}

function titleScore(local, remote) {
  const a = normTitle(local);
  const b = normTitle(remote);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  let hit = 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) hit++;
  }
  return hit / Math.max(shorter.length, 1);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function getSessionBase() {
  const html = await fetchText(BASE);
  const m = html.match(/https?:\/\/opac\.nlc\.cn(?::80)?\/F\/[^\s"'<>?]*/i);
  return m ? m[0].replace(":80", "") : BASE;
}

function searchUrl(sessionBase, code, request) {
  const u = new URL(sessionBase);
  u.searchParams.set("func", "find-b");
  u.searchParams.set("find_code", code);
  u.searchParams.set("request", request);
  u.searchParams.set("local_base", "NLC01");
  return u.toString();
}

function parseFieldTable(html) {
  const tableMatch = html.match(/<table[^>]*\bid=["']td["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;
  const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const data = {};
  let prevKey = "";
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*class=["']td1["'][^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => decodeHtml(m[1]),
    );
    if (cells.length < 2) continue;
    const key = cells[0];
    const val = cells[1];
    if (!key && !val) continue;
    if (key) {
      data[key] = val;
      prevKey = key;
    } else if (prevKey) {
      data[prevKey] = `${data[prevKey]}\n${val}`.trim();
    }
  }
  return data;
}

function parseIsbnFromHtml(html) {
  const m = html.match(/ISBN:\s*([\d-]+)/i);
  if (!m) return null;
  const compact = m[1].replace(/-/g, "");
  if (/^\d{9}[\dXx]$/i.test(compact) || /^97[89]\d{10}$/.test(compact)) return compact.toUpperCase();
  return null;
}

function stripTitle(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(.+?)\s+\[[\u4e00-\u9fa5]{1,4}\]/);
  return (m ? m[1] : s).replace(/\s*\/\s*.+$/, "").trim() || s;
}

function stripAuthors(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/\n+/)
    .map((line) => line.replace(/\s+(著|编|译|撰|主编|编著).*$/, "").trim())
    .filter(Boolean);
}

function parsePublisher(pubItem) {
  const m = String(pubItem || "").match(/:\s*(.+?),\s/);
  return m ? m[1].trim() : null;
}

function parseYear(data) {
  const general = String(data["通用数据"] || "");
  const ym = general.match(/\d{9}(\d{4})/);
  if (ym) return Number(ym[1]);
  const pub = String(data["出版项"] || "");
  const y2 = pub.match(/\b(19|20)\d{2}\b/);
  return y2 ? Number(y2[0]) : null;
}

function parseCategories(data) {
  const tags = [];
  const subject = String(data["主题"] || "").replace(/--/g, "·");
  for (const part of subject.split(/[&；;]+/)) {
    const t = part.trim();
    if (t) tags.push(t);
  }
  const clc = String(data["中图分类号"] || "").trim();
  if (clc) tags.push(clc);
  return [...new Set(tags)];
}

function metadataFromDetailHtml(html) {
  const data = parseFieldTable(html);
  if (!data) return null;
  const titleRaw = data["题名与责任"] || "";
  if (!titleRaw && !data["著者"]) return null;
  return {
    title: stripTitle(titleRaw),
    authors: stripAuthors(data["著者"]),
    publisher: parsePublisher(data["出版项"]),
    year: parseYear(data),
    description: data["内容提要"] || null,
    isbn: parseIsbnFromHtml(html),
    categories: parseCategories(data),
    publishedDate: parseYear(data) != null ? String(parseYear(data)) : null,
  };
}

function parseSearchList(html) {
  const items = [];
  const blocks = [...html.matchAll(/<div[^>]*class=["']itemtitle["'][^>]*>([\s\S]*?)<\/div>/gi)];
  for (const block of blocks) {
    const inner = block[1];
    const a = inner.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    items.push({ title: decodeHtml(a[2]), href: a[1].replace(/&amp;/g, "&") });
  }
  return items;
}

function isDetailPage(html) {
  return /id=["']td["']/.test(html) && /题名与责任/.test(html);
}

async function lookupByIsbn(sessionBase, isbn) {
  const html = await fetchText(searchUrl(sessionBase, "ISB", isbn));
  if (isDetailPage(html)) return metadataFromDetailHtml(html);
  const list = parseSearchList(html);
  if (list.length === 1) {
    await sleep(SLEEP_MS);
    const detail = await fetchText(list[0].href);
    return metadataFromDetailHtml(detail);
  }
  if (list.length === 0) return null;
  return { _ambiguous: list.length, _by: "isbn" };
}

async function lookupByTitle(sessionBase, title, authorHint) {
  const q = authorHint ? `${title} ${authorHint}` : title;
  const html = await fetchText(searchUrl(sessionBase, "WTP", q));
  if (isDetailPage(html)) {
    const meta = metadataFromDetailHtml(html);
    if (!meta) return null;
    const score = titleScore(title, meta.title);
    if (score < 0.55) return { _ambiguous: 1, _by: "title", _score: score };
    return meta;
  }
  const list = parseSearchList(html);
  if (list.length === 0) return null;
  const scored = list
    .map((item) => ({ ...item, score: titleScore(title, item.title) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.55) return { _ambiguous: list.length, _by: "title" };
  if (second && second.score >= best.score - 0.05 && second.score >= 0.55) {
    return { _ambiguous: list.length, _by: "title", _best: best.title, _score: best.score };
  }
  await sleep(SLEEP_MS);
  const detail = await fetchText(best.href);
  const meta = metadataFromDetailHtml(detail);
  if (!meta) return null;
  return meta;
}

function parseExtra(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function isbnOf(extra, title) {
  const fromExtra = String(extra.isbn || "").replace(/[-\s]/g, "");
  if (/^(\d{9}[\dXx]|\d{13})$/i.test(fromExtra)) return fromExtra.toUpperCase();
  const m = String(title || "").match(/\b(97[89]\d{10}|\d{9}[\dXx])\b/i);
  return m ? m[1].toUpperCase() : null;
}

function mergeItem(item, meta) {
  const extra = parseExtra(item.extraJson);
  const nextExtra = { ...extra };
  if ((!extra.authors || !extra.authors.length) && meta.authors?.length) {
    nextExtra.authors = meta.authors;
  }
  if (!extra.isbn && meta.isbn) nextExtra.isbn = meta.isbn;
  if (!extra.publisher && meta.publisher) nextExtra.publisher = meta.publisher;
  if (!extra.publishedDate && meta.publishedDate) nextExtra.publishedDate = meta.publishedDate;
  if ((!extra.categories || !extra.categories.length) && meta.categories?.length) {
    nextExtra.categories = meta.categories;
  }
  nextExtra.nlcEnrichedAt = new Date().toISOString().slice(0, 10);

  const data = {
    description: item.description?.trim() ? item.description : meta.description || item.description,
    year: item.year ?? meta.year ?? null,
    extraJson: JSON.stringify(nextExtra),
  };
  // 标题：仅当本地标题过短/明显残缺且国图更完整时才改（保守：默认不改标题）
  return data;
}

async function main() {
  const where = { type: "book" };
  if (onlyId != null) {
    if (!Number.isInteger(onlyId) || onlyId <= 0) {
      console.error("--id= 须为正整数");
      process.exit(1);
    }
    where.id = onlyId;
  }

  const books = await prisma.item.findMany({
    where,
    orderBy: { id: "asc" },
  });
  console.log(`图书 ${books.length} 本${dryRun ? "（dry-run）" : ""}`);

  let sessionBase = BASE;
  try {
    sessionBase = await getSessionBase();
    console.log("OPAC session:", sessionBase);
  } catch (err) {
    console.warn("获取 session 失败，改用固定入口:", err.message);
  }
  await sleep(SLEEP_MS);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const item of books) {
    const extra = parseExtra(item.extraJson);
    const isbn = isbnOf(extra, item.title);
    const authorHint = Array.isArray(extra.authors) && extra.authors[0] ? extra.authors[0] : null;
    process.stdout.write(`[${item.id}] ${item.title} … `);

    try {
      let meta = null;
      let via = "";
      if (isbn) {
        meta = await lookupByIsbn(sessionBase, isbn);
        via = "isbn";
        if (meta && meta._ambiguous) meta = null;
        if (!meta) {
          await sleep(SLEEP_MS);
          meta = await lookupByTitle(sessionBase, item.title, authorHint);
          via = "title";
        }
      } else {
        meta = await lookupByTitle(sessionBase, item.title, authorHint);
        via = "title";
      }

      if (!meta) {
        console.log("无结果");
        fail++;
      } else if (meta._ambiguous) {
        console.log(`多义/低匹配 (${meta._by} n=${meta._ambiguous}${meta._best ? ` best=${meta._best}` : ""})`);
        skip++;
      } else {
        const data = mergeItem(item, meta);
        console.log(
          `OK via=${via} pub=${meta.publisher || "-"} year=${meta.year || "-"} authors=${(meta.authors || []).slice(0, 2).join("/") || "-"}`,
        );
        if (!dryRun) {
          await prisma.item.update({ where: { id: item.id }, data });
        }
        ok++;
      }
    } catch (err) {
      console.log("失败:", err.message);
      fail++;
    }
    await sleep(SLEEP_MS);
  }

  console.log(`\n完成 ok=${ok} skip=${skip} fail=${fail}${dryRun ? "（未写入）" : ""}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
