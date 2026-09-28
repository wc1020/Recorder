/**
 * 一次性：把豆伴 Excel 的「读过 / 在读 / 想读」导入本地图书。
 * 按豆瓣 subject 链接去重；已有条目只更新状态/评分/短评，缺资料的再抓豆瓣页面并下封面。
 *
 *   node scripts/import-douban-books-xlsx.mjs --dry-run
 *   node scripts/import-douban-books-xlsx.mjs
 *   node scripts/import-douban-books-xlsx.mjs [xlsx路径] [--skip-fetch]
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = path.join(root, "local", "dev.db");
const COVER_DIR = path.join(root, "local", "covers");
const DATABASE_URL = "file:" + DB_FILE.replaceAll("\\", "/");
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const MANUAL_SOURCE = "manual";
const SHEETS = [
  { file: "sheet7.xml", status: "done", name: "读过" },
  { file: "sheet8.xml", status: "in_progress", name: "在读" },
  { file: "sheet9.xml", status: "wishlist", name: "想读" },
];
const STATUS_RANK = { done: 3, in_progress: 2, wishlist: 1 };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipFetch = args.includes("--skip-fetch");
const xlsxPath = path.resolve(
  args.find((a) => !a.startsWith("--")) || path.join(root, "豆伴(184742209).xlsx"),
);

class BlockedError extends Error {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function politeSleep() {
  return sleep(3000 + Math.floor(Math.random() * 2000));
}

function extractXlsx(file) {
  const dir = mkdtempSync(path.join(tmpdir(), "douban-books-xlsx-"));
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(file)}, ${JSON.stringify(dir)})`,
    ],
    { stdio: "pipe" },
  );
  return dir;
}

function decode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/_x000d_/gi, "\n");
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

function normTitle(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/（插图.*|插图第?\d*版|珍藏版|典藏合集|全[一二三四五六七八九十\d]+册|上下）?/g, "")
    .replace(/[\s（）()\[\]【】·・.,，。:：;；"'“”‘’《》]/g, "");
}

function subjectIdOf(url) {
  return String(url || "").match(/book\.douban\.com\/subject\/(\d+)/)?.[1] ?? null;
}

function dateFromCreated(raw) {
  const m = String(raw || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function yearFromIntro(intro) {
  const m = String(intro || "").match(/(?:^|\/\s*)((?:19|20)\d{2})(?:\s*\/|$)/);
  return m ? Number(m[1]) : null;
}

function parseIntroBits(intro) {
  const parts = String(intro || "")
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  let authors = [];
  let year = null;
  let publisher = null;
  for (const p of parts) {
    if (/^(19|20)\d{2}/.test(p) && year == null) {
      year = Number(p.slice(0, 4));
    } else if (year != null && !publisher) {
      publisher = p;
    } else if (year == null) {
      authors.push(p);
    } else if (!publisher) {
      publisher = p;
    }
  }
  // 「2022 / 四川文艺出版社」没有作者
  if (!authors.length && parts.length >= 2 && year != null) {
    publisher = parts.find((p) => !/^(19|20)\d{2}/.test(p)) || publisher;
  }
  return { authors, year, publisher };
}

function parseRating(starsRaw, reviewRaw) {
  const stars = Number(starsRaw);
  const starRating =
    Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars * 2 : null;
  const text = String(reviewRaw || "").trim();
  if (!text) return { rating: starRating, review: null };
  return { rating: starRating, review: text };
}

function entryDates(status, markedOn) {
  if (status === "done") return { wishlistOn: null, startedOn: null, finishedOn: markedOn };
  if (status === "in_progress") return { wishlistOn: null, startedOn: markedOn, finishedOn: null };
  return { wishlistOn: markedOn, startedOn: null, finishedOn: null };
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

function decodeHtml(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function checkBlocked(res, html) {
  const host = new URL(res.url).hostname;
  if (host.startsWith("sec.") || res.status === 403 || res.status === 418) {
    throw new BlockedError(`被豆瓣风控拦截（${res.status} ${res.url}）`);
  }
  if (html && /检测到有异常请求|禁止访问|登录跳转/.test(html.slice(0, 5000))) {
    throw new BlockedError("被豆瓣风控拦截（异常请求页）");
  }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return null;
  const html = await res.text();
  checkBlocked(res, html);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return { url: res.url, html };
}

function parseInfo(html) {
  const block = html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  const fields = {};
  for (const chunk of block.split(/<br\s*\/?>/i)) {
    const label = chunk.match(/<span class="pl">\s*([^<:：]+?)\s*[:：]?\s*<\/span>/);
    if (!label) continue;
    const key = label[1].trim();
    const rest = chunk.slice(chunk.indexOf(label[0]) + label[0].length);
    const links = [...rest.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => decodeHtml(m[1]));
    fields[key] = {
      text: decodeHtml(rest).replace(/^[:：\s]+/, "").trim(),
      links: links.filter(Boolean),
    };
  }
  return fields;
}

function parseIntro(html) {
  const start = html.indexOf('id="link-report"');
  if (start < 0) return null;
  const end = html.indexOf("<h2", start);
  const scope = html.slice(start, end > 0 ? end : undefined);
  const full = scope.match(/<span class="all hidden">[\s\S]*?<div class="intro">([\s\S]*?)<\/div>/);
  const short = scope.match(/<div class="intro">([\s\S]*?)<\/div>/);
  const raw = (full ?? short)?.[1];
  if (!raw) return null;
  return decodeHtml(raw.replace(/<style[\s\S]*?<\/style>/g, "")).replace(/\(展开全部\)$/, "").trim() || null;
}

function parseTags(html, title) {
  const criteria = html.match(/criteria\s*=\s*'([^']*)'/)?.[1] ?? "";
  const tags = criteria
    .split("|")
    .filter((t) => t.startsWith("7:"))
    .map((t) => t.slice(2).trim())
    .filter((t) => t && normTitle(t) !== normTitle(title));
  return [...new Set(tags)].slice(0, 6);
}

function parseSubject(html, url) {
  const title = decodeHtml(html.match(/<span property="v:itemreviewed">([\s\S]*?)<\/span>/)?.[1] ?? "");
  if (!title) return null;
  const info = parseInfo(html);
  const person = (k) =>
    info[k]?.links.length ? info[k].links : info[k]?.text ? info[k].text.split(/\s*\/\s*/) : [];
  const text = (k) => info[k]?.text || null;
  let cover = html.match(/<a class="nbg"\s+href="([^"]+)"/)?.[1] ?? null;
  if (cover && /book-default|update_image/.test(cover)) cover = null;
  const published = text("出版年");
  const year = Number.parseInt(published?.match(/\d{4}/)?.[0] ?? "", 10);
  const pages = Number.parseInt(text("页数")?.match(/\d+/)?.[0] ?? "", 10);
  return {
    doubanId: subjectIdOf(url),
    title,
    originalTitle: text("原作名") || text("副标题") || null,
    authors: person("作者"),
    translators: person("译者"),
    publisher: info["出版社"]?.links[0] || text("出版社"),
    publishedDate: published,
    year: Number.isFinite(year) ? year : null,
    pageCount: Number.isFinite(pages) ? pages : null,
    isbn: text("ISBN")?.replace(/[^\dXx]/g, "") || null,
    series: info["丛书"]?.links[0] || text("丛书"),
    description: parseIntro(html),
    categories: parseTags(html, title),
    cover,
  };
}

async function downloadCover(url, itemId) {
  for (const candidate of [url, url.replace("/l/public/", "/m/public/")]) {
    const res = await fetch(candidate, {
      headers: { "User-Agent": UA, Referer: "https://book.douban.com/" },
      signal: AbortSignal.timeout(30000),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) continue;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const file = `book-${itemId}.${ext}`;
    writeFileSync(path.join(COVER_DIR, file), Buffer.from(await res.arrayBuffer()));
    return `/api/local-cover/${file}`;
  }
  return null;
}

function pick(next, prev) {
  return next != null && next !== "" ? next : prev;
}
function pickArr(next, prev) {
  return next && next.length ? next : prev;
}

function loadRows(dir) {
  const rows = [];
  for (const sheet of SHEETS) {
    const xml = readFileSync(path.join(dir, "xl", "worksheets", sheet.file), "utf8");
    for (const r of parseSheet(xml).slice(1)) {
      if (!r.A) continue;
      const doubanId = subjectIdOf(r.D);
      if (!doubanId) {
        console.warn(`跳过无豆瓣链接：${r.A}`);
        continue;
      }
      const bits = parseIntroBits(r.B);
      const { rating, review } = parseRating(r.F, r.H);
      rows.push({
        title: r.A.trim(),
        intro: r.B || "",
        doubanId,
        url: `https://book.douban.com/subject/${doubanId}/`,
        status: sheet.status,
        sheet: sheet.name,
        markedOn: dateFromCreated(r.E),
        rating,
        review,
        authors: bits.authors,
        year: bits.year ?? yearFromIntro(r.B),
        publisher: bits.publisher,
      });
    }
  }
  return rows;
}

function mergeRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    const prev = byId.get(row.doubanId);
    if (!prev || (STATUS_RANK[row.status] ?? 0) > (STATUS_RANK[prev.status] ?? 0)) {
      byId.set(row.doubanId, {
        ...row,
        rating: row.rating ?? prev?.rating ?? null,
        review: row.review || prev?.review || null,
      });
    } else {
      if (prev.rating == null && row.rating != null) prev.rating = row.rating;
      if (!prev.review && row.review) prev.review = row.review;
    }
  }
  return [...byId.values()];
}

async function writeEntry(itemId, status, rating, review, markedOn) {
  const dates = entryDates(status, markedOn);
  await prisma.entry.upsert({
    where: { itemId },
    create: {
      itemId,
      status,
      rating,
      review,
      wishlistOn: dates.wishlistOn,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
    update: {
      status,
      rating,
      review,
      wishlistOn: dates.wishlistOn,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
  });
}

async function applyMeta(item, meta) {
  const extra = parseExtra(item.extraJson);
  const nextExtra = {
    ...extra,
    authors: pickArr(meta.authors, extra.authors),
    translators: pickArr(meta.translators, extra.translators),
    publisher: pick(meta.publisher, extra.publisher),
    publishedDate: pick(meta.publishedDate, extra.publishedDate),
    pageCount: pick(meta.pageCount, extra.pageCount),
    isbn: pick(meta.isbn, extra.isbn),
    series: pick(meta.series, extra.series),
    categories: pickArr(meta.categories, extra.categories),
    doubanId: meta.doubanId || extra.doubanId,
  };
  let coverUrl = item.coverUrl;
  if (meta.cover) {
    await sleep(800);
    coverUrl = (await downloadCover(meta.cover, item.id)) ?? item.coverUrl;
  }
  await prisma.item.update({
    where: { id: item.id },
    data: {
      title: meta.title || item.title,
      originalTitle: pick(meta.originalTitle, item.originalTitle),
      year: pick(meta.year, item.year),
      description: pick(meta.description, item.description),
      coverUrl,
      extraJson: JSON.stringify(nextExtra),
    },
  });
  return coverUrl;
}

async function main() {
  console.log("读取", xlsxPath);
  const dir = extractXlsx(xlsxPath);
  let list;
  try {
    const raw = loadRows(dir);
    list = mergeRows(raw);
    console.log(
      `表格图书 ${raw.length} 行（读过/在读/想读），按豆瓣 id 去重后 ${list.length}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const existing = await prisma.item.findMany({
    where: { type: "book" },
    include: { entry: true },
  });
  const byDouban = new Map();
  const byTitle = new Map();
  for (const item of existing) {
    const extra = parseExtra(item.extraJson);
    if (extra.doubanId) byDouban.set(String(extra.doubanId), item);
    const key = normTitle(item.title);
    if (key && !byTitle.has(key)) byTitle.set(key, item);
  }

  if (!dryRun) {
    mkdirSync(COVER_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    const backup = path.join(root, "local", `dev.db.before-book-import-${stamp}`);
    copyFileSync(DB_FILE, backup);
    console.log("已备份数据库 →", path.relative(root, backup));
  }

  const report = { created: [], updated: [], fetched: [], skippedFetch: [], failed: [] };
  const needFetch = [];

  for (const row of list) {
    let item = byDouban.get(row.doubanId) || byTitle.get(normTitle(row.title)) || null;
    const rating =
      row.rating != null ? row.rating : item?.entry?.rating ?? null;
    const review = row.review || item?.entry?.review || null;

    if (dryRun) {
      const action = item ? "更新" : "新建";
      console.log(
        `[dry] ${action} ${row.title} (${row.sheet}) douban=${row.doubanId} rating=${rating ?? "-"}`,
      );
      if (item) report.updated.push(row.title);
      else report.created.push(row.title);
      continue;
    }

    if (!item) {
      const extra = {
        authors: row.authors,
        publisher: row.publisher || null,
        publishedDate: row.year != null ? String(row.year) : null,
        doubanId: row.doubanId,
      };
      item = await prisma.item.create({
        data: {
          type: "book",
          source: MANUAL_SOURCE,
          sourceId: `douban-${row.doubanId}`,
          title: row.title,
          year: row.year,
          description: null,
          coverUrl: null,
          extraJson: JSON.stringify(extra),
        },
        include: { entry: true },
      });
      byDouban.set(row.doubanId, item);
      byTitle.set(normTitle(row.title), item);
      report.created.push(row.title);
      needFetch.push(item.id);
    } else {
      const extra = parseExtra(item.extraJson);
      extra.doubanId = row.doubanId;
      if ((!extra.authors || !extra.authors.length) && row.authors.length) {
        extra.authors = row.authors;
      }
      if (!extra.publisher && row.publisher) extra.publisher = row.publisher;
      await prisma.item.update({
        where: { id: item.id },
        data: {
          year: item.year ?? row.year,
          extraJson: JSON.stringify(extra),
        },
      });
      byDouban.set(row.doubanId, item);
      report.updated.push(row.title);
      if (!item.coverUrl || !item.description) needFetch.push(item.id);
    }

    await writeEntry(item.id, row.status, rating, review, row.markedOn);
  }

  console.log(
    `\n入库：新建 ${report.created.length}，更新 ${report.updated.length}` +
      (dryRun ? "（dry-run）" : ""),
  );

  if (dryRun || skipFetch) {
    if (skipFetch) console.log("已 --skip-fetch，不抓豆瓣页面");
    await prisma.$disconnect();
    return;
  }

  const fetchIds = [...new Set(needFetch)];
  console.log(`需抓取资料 ${fetchIds.length} 本…`);
  for (const id of fetchIds) {
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) continue;
    const doubanId = parseExtra(item.extraJson).doubanId;
    process.stdout.write(`[${item.id}] ${item.title} … `);
    try {
      if (!doubanId) {
        console.log("无 doubanId，跳过");
        report.skippedFetch.push(item.title);
        continue;
      }
      const page = await fetchPage(`https://book.douban.com/subject/${doubanId}/`);
      if (!page) {
        console.log("404");
        report.failed.push(item.title);
      } else {
        const meta = parseSubject(page.html, page.url);
        if (!meta) {
          console.log("解析失败");
          report.failed.push(item.title);
        } else {
          const coverUrl = await applyMeta(item, meta);
          console.log(
            `OK 封面${coverUrl?.startsWith("/api/") ? "已下载" : coverUrl ? "保留" : "无"} 简介${meta.description ? meta.description.length + "字" : "无"}`,
          );
          report.fetched.push(item.title);
        }
      }
    } catch (err) {
      if (err instanceof BlockedError) {
        console.log(`\n${err.message}，停止抓取。已导入的条目保留；稍后再跑 enrich 脚本补剩余封面。`);
        break;
      }
      console.log("失败:", err.message);
      report.failed.push(item.title);
    }
    await politeSleep();
  }

  console.log(
    `\n完成 新建=${report.created.length} 更新=${report.updated.length} 抓取=${report.fetched.length} 抓取失败=${report.failed.length}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
