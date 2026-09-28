"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PosterWallItem = {
  title: string;
  /** 按优先级排列的封面候选；会依次试。 */
  urls: string[];
  rating: number | null;
};

type Props = {
  typeLabel: string;
  items: PosterWallItem[];
};

const COLS = 5;
const ROWS = 6;
const CELL_W = 140;
const CELL_H = 210;
const GAP = 4;

function proxyUrl(url: string): string {
  if (url.startsWith("/")) return url;
  return `/api/cover-proxy?url=${encodeURIComponent(url)}`;
}

function loadImage(urls: string[]): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let i = 0;
    const tryNext = () => {
      if (i >= urls.length) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        i += 1;
        tryNext();
      };
      img.src = proxyUrl(urls[i]);
    };
    tryNext();
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** 简化版 DoubanImageWall：密铺 + 高分偶尔占 2×2 大格。 */
async function buildWall(items: PosterWallItem[]): Promise<HTMLCanvasElement | null> {
  const sorted = [...items].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const loaded: { item: PosterWallItem; img: HTMLImageElement }[] = [];
  for (const item of sorted) {
    if (!item.urls.length) continue;
    const img = await loadImage(item.urls);
    if (img) loaded.push({ item, img });
    if (loaded.length >= COLS * ROWS + 8) break;
  }
  if (!loaded.length) return null;

  const canvas = document.createElement("canvas");
  const width = COLS * CELL_W + (COLS - 1) * GAP;
  const height = ROWS * CELL_H + (ROWS - 1) * GAP;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);

  const occupied = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let cursor = 0;

  const place = (r: number, c: number, span: number, entry: (typeof loaded)[0]) => {
    const x = c * (CELL_W + GAP);
    const y = r * (CELL_H + GAP);
    const w = span * CELL_W + (span - 1) * GAP;
    const h = span * CELL_H + (span - 1) * GAP;
    drawCover(ctx, entry.img, x, y, w, h);
    for (let dr = 0; dr < span; dr++) {
      for (let dc = 0; dc < span; dc++) {
        occupied[r + dr][c + dc] = true;
      }
    }
  };

  let bigEvery = 7;
  let sinceBig = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (occupied[r][c]) continue;
      if (cursor >= loaded.length) break;

      const wantBig =
        sinceBig >= bigEvery &&
        c <= COLS - 2 &&
        r <= ROWS - 2 &&
        !occupied[r][c + 1] &&
        !occupied[r + 1][c] &&
        !occupied[r + 1][c + 1] &&
        (loaded[cursor].item.rating ?? 0) >= 9;

      if (wantBig) {
        place(r, c, 2, loaded[cursor]);
        cursor += 1;
        sinceBig = 0;
        bigEvery = 6 + ((cursor * 3) % 5);
      } else {
        place(r, c, 1, loaded[cursor]);
        cursor += 1;
        sinceBig += 1;
      }
    }
  }

  return canvas;
}

export function PosterWallButton({ typeLabel, items }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function generate() {
    setBusy(true);
    setError(null);
    setPreview(null);
    setOpen(true);
    try {
      const canvas = await buildWall(items);
      if (!canvas) {
        setError("没有可用的封面。");
        return;
      }
      setPreview(canvas.toDataURL("image/png"));
    } catch {
      setError("生成失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = `projectm-${typeLabel}-海报墙.png`;
    a.click();
  }

  if (!items.length) return null;

  return (
    <>
      <button type="button" className="home-wall-btn" onClick={() => void generate()}>
        海报墙
      </button>
      <dialog
        ref={dialogRef}
        className="poster-wall-dialog"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          setPreview(null);
          setError(null);
        }}
      >
        <div className="poster-wall-panel">
          <div className="poster-wall-bar">
            <h2 id={titleId} className="poster-wall-title">
              {typeLabel}海报墙
            </h2>
            <div className="poster-wall-actions">
              {preview ? (
                <button type="button" className="btn btn-mini" onClick={download}>
                  下载 PNG
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-mini btn-ghost"
                onClick={() => dialogRef.current?.close()}
              >
                关闭
              </button>
            </div>
          </div>
          {busy ? <p className="muted poster-wall-status">正在拼图…</p> : null}
          {error ? <p className="error poster-wall-status">{error}</p> : null}
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="poster-wall-preview" src={preview} alt={`${typeLabel}海报墙`} />
          ) : null}
        </div>
      </dialog>
    </>
  );
}
