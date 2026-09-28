import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const COVER_DIR = path.join(process.cwd(), "local", "covers");
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** 本地下载的封面（local/covers/），离线也能看。 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.exec(file);
  if (!m) {
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  }
  try {
    const data = await readFile(path.join(COVER_DIR, file));
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": TYPES[m[1].toLowerCase()],
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
