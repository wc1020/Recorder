"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isMediaType,
  isStatusFor,
  MANUAL_SOURCE,
  type MediaType,
} from "@/lib/constants";
import {
  applyStatusDate,
  dateOrderError,
  entryDateFields,
  isDateInput,
  parseDateInput,
  todayLocal,
  type EntryDateKey,
  type EntryDates,
} from "@/lib/entry-dates";
import { prisma } from "@/lib/db";
import { mediaPageHref } from "@/lib/list-href";
import { getProvider, ProviderNotConfiguredError, type ItemSnapshot } from "@/lib/providers";
import { getSteamGamePage, getSteamPlayerPage, refreshSteamProfileLive } from "@/lib/providers/steam";
import { loadSteamBackup } from "@/lib/steam-cache";
import { loadLocalEnv } from "@/lib/load-local-env";
import { savePaidFen } from "@/lib/steam-paid";

export async function addItem(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const typeRaw = String(formData.get("type") ?? "");
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  if (!isMediaType(typeRaw) || !sourceId) {
    return { error: "参数无效" };
  }

  let itemId: number;
  try {
    const provider = getProvider(typeRaw);
    const snap = await provider.getDetail(sourceId);
    const item = await prisma.item.upsert({
      where: {
        type_source_sourceId: {
          type: snap.type,
          source: snap.source,
          sourceId: snap.sourceId,
        },
      },
      create: { ...itemFields(snap), type: snap.type, source: snap.source, sourceId: snap.sourceId },
      update: itemFields(snap),
    });
    await prisma.entry.upsert({
      where: { itemId: item.id },
      create: { itemId: item.id, status: "wishlist", wishlistOn: todayLocal() },
      update: {},
    });
    itemId = item.id;
  } catch (err) {
    const message =
      err instanceof ProviderNotConfiguredError
        ? err.message
        : err instanceof Error
          ? err.message
          : "加入失败";
    return { error: message };
  }

  revalidatePath("/");
  revalidatePath("/search");
  redirect(`/item/${itemId}`);
}

export async function saveEntry(formData: FormData): Promise<void> {
  const itemId = Number(formData.get("itemId"));
  const statusRaw = String(formData.get("status") ?? "");
  const ratingRaw = String(formData.get("rating") ?? "");
  const review = String(formData.get("review") ?? "").trim() || null;

  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("参数无效");
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { type: true, entry: true },
  });
  if (!item || !isStatusFor(item.type, statusRaw)) {
    throw new Error("参数无效");
  }

  const rawWishlist = String(formData.get("wishlistOn") ?? "");
  const rawStarted = String(formData.get("startedOn") ?? "");
  const rawFinished = String(formData.get("finishedOn") ?? "");
  if (!isDateInput(rawWishlist) || !isDateInput(rawStarted) || !isDateInput(rawFinished)) {
    redirect(`/item/${itemId}?err=dates`);
  }

  const shown = new Set(entryDateFields(item.type, statusRaw).map((f) => f.key));
  const prev = item.entry;
  const pick = (key: EntryDateKey, raw: string) =>
    shown.has(key) ? parseDateInput(raw) : (prev?.[key] ?? null);
  let dates: EntryDates = {
    wishlistOn: pick("wishlistOn", rawWishlist),
    startedOn: pick("startedOn", rawStarted),
    finishedOn: pick("finishedOn", rawFinished),
  };
  dates = applyStatusDate(item.type, prev?.status ?? null, statusRaw, dates);
  if (dateOrderError(item.type, dates, statusRaw)) {
    redirect(`/item/${itemId}?err=dates`);
  }

  let rating: number | null = null;
  if (ratingRaw !== "") {
    const n = Number(ratingRaw);
    if (!Number.isInteger(n) || n < 0 || n > 10) {
      throw new Error("评分须为 0–10 的整数");
    }
    rating = n;
  }

  await prisma.entry.upsert({
    where: { itemId },
    create: {
      itemId,
      status: statusRaw,
      rating,
      review,
      wishlistOn: dates.wishlistOn,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
    update: {
      status: statusRaw,
      rating,
      review,
      wishlistOn: dates.wishlistOn,
      startedOn: dates.startedOn,
      finishedOn: dates.finishedOn,
    },
  });

  revalidatePath("/");
  revalidatePath(`/item/${itemId}`);
  redirect(`/item/${itemId}?saved=1`);
}

function itemFields(snap: ItemSnapshot) {
  return {
    title: snap.title,
    originalTitle: snap.originalTitle,
    year: snap.year,
    coverUrl: snap.coverUrl,
    description: snap.description,
    extraJson: snap.extraJson,
  };
}

function isCatalogType(type: string): type is Exclude<MediaType, "game"> {
  return type === "movie" || type === "tv" || type === "book";
}

export async function refreshItem(itemId: number): Promise<{ error?: string }> {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || !isCatalogType(item.type)) {
    return { error: "条目不存在" };
  }
  if (item.source === MANUAL_SOURCE) {
    return { error: "手动添加的条目没有远程资料" };
  }
  try {
    const snap = await getProvider(item.type).getDetail(item.sourceId);
    await prisma.item.update({
      where: { id: item.id },
      data: itemFields(snap),
    });
  } catch (err) {
    return {
      error:
        err instanceof ProviderNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "刷新失败",
    };
  }
  revalidatePath("/");
  revalidatePath(`/item/${item.id}`);
  return {};
}

export async function addManualItem(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const typeRaw = String(formData.get("type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const originalTitle = String(formData.get("originalTitle") ?? "").trim() || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const coverUrl = String(formData.get("coverUrl") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!isCatalogType(typeRaw)) return { error: "请选择电影、电视剧或图书" };
  if (!title || title.length > 200) return { error: "请填写标题" };

  let year: number | null = null;
  if (yearRaw) {
    year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 1000 || year > 2100) {
      return { error: "年份无效" };
    }
  }
  if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
    return { error: "封面须是 http(s) 链接" };
  }

  const item = await prisma.item.create({
    data: {
      type: typeRaw,
      source: MANUAL_SOURCE,
      sourceId: crypto.randomUUID(),
      title,
      originalTitle,
      year,
      coverUrl,
      description,
    },
  });
  await prisma.entry.create({
    data: { itemId: item.id, status: "wishlist", wishlistOn: todayLocal() },
  });
  revalidatePath("/");
  revalidatePath("/search");
  redirect(`/item/${item.id}`);
}

export async function createCollection(formData: FormData): Promise<void> {
  const typeRaw = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const itemId = Number(formData.get("itemId"));
  if (!isCatalogType(typeRaw) || !name || name.length > 40) {
    throw new Error("片单名称无效");
  }
  const collection = await prisma.collection.create({
    data: { type: typeRaw, name },
  });
  if (Number.isInteger(itemId) && itemId > 0) {
    await prisma.collectionItem.create({
      data: { collectionId: collection.id, itemId },
    });
    revalidatePath("/");
    revalidatePath(`/item/${itemId}`);
    redirect(`/item/${itemId}`);
  }
  revalidatePath("/");
  redirect(mediaPageHref(typeRaw, { list: String(collection.id) }));
}

export async function addItemToCollection(formData: FormData): Promise<void> {
  const collectionId = Number(formData.get("collectionId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(collectionId) || collectionId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("参数无效");
  }
  const [collection, item] = await Promise.all([
    prisma.collection.findUnique({ where: { id: collectionId } }),
    prisma.item.findUnique({ where: { id: itemId } }),
  ]);
  if (!collection || !item || collection.type !== item.type) {
    throw new Error("片单不匹配");
  }
  await prisma.collectionItem.upsert({
    where: { collectionId_itemId: { collectionId, itemId } },
    create: { collectionId, itemId },
    update: {},
  });
  revalidatePath("/");
  revalidatePath(`/item/${itemId}`);
  redirect(`/item/${itemId}`);
}

export async function removeItemFromCollection(formData: FormData): Promise<void> {
  const collectionId = Number(formData.get("collectionId"));
  const itemId = Number(formData.get("itemId"));
  if (!Number.isInteger(collectionId) || collectionId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("参数无效");
  }
  await prisma.collectionItem.deleteMany({ where: { collectionId, itemId } });
  revalidatePath("/");
  revalidatePath(`/item/${itemId}`);
  redirect(`/item/${itemId}`);
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const collectionId = Number(formData.get("collectionId"));
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    throw new Error("参数无效");
  }
  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection || !isCatalogType(collection.type)) {
    throw new Error("片单不存在");
  }
  await prisma.collection.delete({ where: { id: collectionId } });
  revalidatePath("/");
  redirect(mediaPageHref(collection.type, { view: "lists" }));
}

export async function saveSteamPaidPrice(formData: FormData): Promise<void> {
  const appid = Number(formData.get("appid"));
  const raw = String(formData.get("paid") ?? "").trim();
  if (!Number.isInteger(appid) || appid <= 0) {
    throw new Error("无效的游戏");
  }

  if (raw === "") {
    await savePaidFen(appid, null);
  } else {
    const yuan = Number(raw);
    if (!Number.isFinite(yuan) || yuan < 0 || yuan > 999999) {
      throw new Error("购入价须为 0–999999 的数字");
    }
    await savePaidFen(appid, Math.round(yuan * 100));
  }

  revalidatePath("/");
  revalidatePath(`/steam/${appid}`);
  const parentAppid = Number(formData.get("parentAppid"));
  if (Number.isInteger(parentAppid) && parentAppid > 0 && parentAppid !== appid) {
    revalidatePath(`/steam/${parentAppid}`);
  }
}

export async function refreshSteamProfile(): Promise<void> {
  await refreshSteamProfileLive();
  revalidatePath("/");
}

/** 空闲超时或以后别的自动更新入口：有备份才拉网，失败留下一份。 */
export async function refreshSteamOnIdle(detailAppid?: number): Promise<void> {
  loadLocalEnv({ reload: true });
  const backup = await loadSteamBackup();
  if (!backup) return;
  try {
    await getSteamPlayerPage({ live: true });
  } catch {
    /* 连不上就继续用备份 */
  }
  if (detailAppid && Number.isInteger(detailAppid) && detailAppid > 0) {
    try {
      await getSteamGamePage(detailAppid, { live: true });
    } catch {
      /* 详情失败也不挡列表备份 */
    }
    revalidatePath(`/steam/${detailAppid}`);
  }
  revalidatePath("/");
}
