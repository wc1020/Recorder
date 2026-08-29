"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMediaType, isStatus } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getProvider, ProviderNotConfiguredError } from "@/lib/providers";
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
    await prisma.entry.upsert({
      where: { itemId: item.id },
      create: { itemId: item.id, status: "wishlist" },
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
  const startedOn = String(formData.get("startedOn") ?? "").trim() || null;
  const finishedOn = String(formData.get("finishedOn") ?? "").trim() || null;

  if (!Number.isInteger(itemId) || itemId <= 0 || !isStatus(statusRaw)) {
    throw new Error("参数无效");
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
      startedOn,
      finishedOn,
    },
    update: {
      status: statusRaw,
      rating,
      review,
      startedOn,
      finishedOn,
    },
  });

  revalidatePath("/");
  revalidatePath(`/item/${itemId}`);
  redirect(`/item/${itemId}?saved=1`);
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
}
