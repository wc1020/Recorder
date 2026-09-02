import { MediaList } from "./media-list";
import { SteamPanel } from "./steam-panel";
import { isMediaType, type MediaType } from "@/lib/constants";
import { parseMediaListQuery } from "@/lib/list-href";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    view?: string;
    live?: string;
    sort?: string;
    genre?: string;
    list?: string;
  }>;
}) {
  const sp = await searchParams;
  const raw = sp.type ?? "";
  const type: MediaType | null =
    raw === "want" ? "game" : isMediaType(raw) ? raw : null;
  const gameView = raw === "want" ? "want" : sp.view;

  if (!type) {
    return (
      <>
        <h1>首页</h1>
        <p className="muted">内容还没定。</p>
      </>
    );
  }

  return (
    <>
      <h1 className="sr-only">ProjectM</h1>
      {type === "game" ? (
        <SteamPanel view={gameView} live={sp.live === "1"} />
      ) : null}
      {type === "movie" || type === "tv" || type === "book" ? (
        <MediaList type={type} query={parseMediaListQuery(sp)} />
      ) : null}
    </>
  );
}
