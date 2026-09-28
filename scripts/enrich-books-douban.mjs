/**
 * 一次性：用豆瓣读书补全本地图书（标题、作者、译者、出版、简介、标签、封面）。
 * 豆瓣有值就覆盖本地；豆瓣没有的字段保留原值。封面下载到 local/covers/。
 * 有 ISBN 走 /isbn/{isbn}，没有或 404 再按书名联想。碰到风控立即停止。
 * 已补过（extra.doubanId）的默认跳过，--force 重做。写库前自动备份 dev.db。
 *
 *   node scripts/enrich-books-douban.mjs --dry-run
 *   node scripts/enrich-books-douban.mjs
 *   node scripts/enrich-books-douban.mjs --id=19 [--force]
 */
import { copyFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = path.join(root, "local", "dev.db");
const COVER_DIR = path.join(root, "local", "covers");
const DATABASE_URL = "file:" + DB_FILE.replaceAll("\\", "/");
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const idArg = args.find((a) => a.startsWith("--id="));
const onlyId = idArg ? Number(idArg.slice(5)) : null;

class BlockedError extends Error {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function politeSleep() {
  return sleep(3000 + Math.floor(Math.random() * 2000));
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

function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s（）()\[\]【】·・.,，。:：;；"'“”‘’《》]/g, "");
}

function titleScore(a, b) {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  return 0;
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

function subjectIdOf(url) {
  return url.match(/\/subject\/(\d+)/)?.[1] ?? null;
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
  const text = decodeHtml(raw.replace(/<style[\s\S]*?<\/style>/g, "")).replace(/\(展开全部\)$/, "").trim();
  return text || null;
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
  const person = (k) => (info[k]?.links.length ? info[k].links : info[k]?.text ? info[k].text.split(/\s*\/\s*/) : []);
  const text = (k) => info[k]?.text || null;

  let cover = html.match(/<a class="nbg"\s+href="([^"]+)"/)?.[1] ?? null;
  if (cover && /book-default|update_image/.test(cover)) cover = null;

  const published = text("出版年");
  const year = Number.parseInt(published?.match(/\d{4}/)?.[0] ?? "", 10);
  const pages = Number.parseInt(text("页数")?.match(/\d+/)?.[0] ?? "", 10);
  const isbn = text("ISBN")?.replace(/[^\dXx]/g, "") || null;

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
    isbn,
    series: info["丛书"]?.links[0] || text("丛书"),
    description: parseIntro(html),
    categories: parseTags(html, title),
    cover,
  };
}

async function findByIsbn(isbn) {
  const page = await fetchPage(`https://book.douban.com/isbn/${isbn}/`);
  if (!page || !subjectIdOf(page.url)) return null;
  return parseSubject(page.html, page.url);
}

async function findByTitle(title, authorHint) {
  const res = await fetch(
    `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`,
    { headers: { ...HEADERS, Accept: "application/json" }, signal: AbortSignal.timeout(30000) },
  );
  checkBlocked(res, null);
  if (!res.ok) throw new Error(`联想 HTTP ${res.status}`);
  const list = (await res.json()).filter((h) => h.type === "b");
  const good = list.filter((h) => titleScore(title, h.title) >= 0.85);
  if (!good.length) return { skip: `联想无匹配（${list.length} 条）` };
  const byAuthor = authorHint ? good.filter((h) => (h.author_name || "").includes(authorHint)) : [];
  const pick = byAuthor[0] ?? (good.length === 1 || titleScore(title, good[0].title) === 1 ? good[0] : null);
  if (!pick) return { skip: `联想多义（${good.map((h) => h.title).join(" / ")}）` };
  await politeSleep();
  const page = await fetchPage(`https://book.douban.com/subject/${pick.id}/`);
  if (!page) return null;
  return parseSubject(page.html, page.url);
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

function parseExtra(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function isbnOf(extra) {
  const s = String(extra.isbn || "").replace(/[-\s]/g, "");
  return /^(\d{9}[\dXx]|\d{13})$/.test(s) ? s : null;
}

function pickArr(next, prev) {
  return next && next.length ? next : prev;
}

function pick(next, prev) {
  return next != null && next !== "" ? next : prev;
}

async function main() {
  const where = { type: "book" };
  if (onlyId != null) where.id = onlyId;
  const books = await prisma.item.findMany({ where, orderBy: { id: "asc" } });
  const todo = books.filter((b) => force || !parseExtra(b.extraJson).doubanId);
  console.log(`图书 ${books.length} 本，待处理 ${todo.length} 本${dryRun ? "（dry-run，不写库、不下封面）" : ""}`);

  if (!dryRun && todo.length) {
    mkdirSync(COVER_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
    const backup = path.join(root, "local", `dev.db.before-douban-${stamp}`);
    copyFileSync(DB_FILE, backup);
    console.log("已备份数据库 →", path.relative(root, backup));
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const item of todo) {
    const extra = parseExtra(item.extraJson);
    const isbn = isbnOf(extra);
    process.stdout.write(`[${item.id}] ${item.title} … `);
    try {
      let book = null;
      let via = "isbn";
      if (isbn) book = await findByIsbn(isbn);
      // 旧 ISBN 常指向合集 / 教辅版：书名对不上、或什么都没有，就当没找到
      if (book && (titleScore(item.title, book.title) === 0 || (!book.cover && !book.description))) {
        process.stdout.write(`ISBN 指向「${book.title}」，改按书名 … `);
        book = null;
      }
      if (!book) {
        if (isbn) await politeSleep();
        via = "书名";
        book = await findByTitle(item.title, extra.authors?.[0]);
      }
      if (!book) {
        console.log("没找到");
        fail++;
      } else if (book.skip) {
        console.log(`跳过：${book.skip}`);
        skip++;
      } else {
        const renamed = book.title !== item.title ? ` 标题「${item.title}」→「${book.title}」` : "";
        let coverUrl = item.coverUrl;
        if (!dryRun && book.cover) {
          await sleep(1000);
          coverUrl = (await downloadCover(book.cover, item.id)) ?? item.coverUrl;
        }
        console.log(
          `OK(${via}) 豆瓣${book.doubanId} ${book.publisher ?? "-"} ${book.publishedDate ?? "-"}` +
            ` 封面${book.cover ? (dryRun ? "有" : coverUrl?.startsWith("/api/") ? "已下载" : "下载失败") : "无"}` +
            ` 简介${book.description ? book.description.length + "字" : "无"} 标签${book.categories.length}${renamed}`,
        );
        if (!dryRun) {
          const nextExtra = {
            ...extra,
            authors: pickArr(book.authors, extra.authors),
            translators: pickArr(book.translators, extra.translators),
            publisher: pick(book.publisher, extra.publisher),
            publishedDate: pick(book.publishedDate, extra.publishedDate),
            pageCount: pick(book.pageCount, extra.pageCount),
            isbn: pick(book.isbn, extra.isbn),
            series: pick(book.series, extra.series),
            categories: pickArr(book.categories, extra.categories),
            doubanId: book.doubanId,
          };
          await prisma.item.update({
            where: { id: item.id },
            data: {
              title: book.title,
              originalTitle: pick(book.originalTitle, item.originalTitle),
              year: pick(book.year, item.year),
              description: pick(book.description, item.description),
              coverUrl,
              extraJson: JSON.stringify(nextExtra),
            },
          });
        }
        ok++;
      }
    } catch (err) {
      if (err instanceof BlockedError) {
        console.log(`\n${err.message}，停止。已处理的已写入；过段时间再跑会从没补过的继续。`);
        break;
      }
      console.log("失败:", err.message);
      fail++;
    }
    await politeSleep();
  }

  console.log(`\n完成 ok=${ok} skip=${skip} fail=${fail}${dryRun ? "（未写入）" : ""}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
