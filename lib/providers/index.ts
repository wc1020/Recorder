import type { MediaType } from "@/lib/constants";
import { localBookProvider } from "./local-book";
import { steamProvider } from "./steam";
import { tmdbProvider, tmdbTvProvider } from "./tmdb";
import type { Provider } from "./types";

export { ProviderNotConfiguredError } from "./types";
export type { ItemSnapshot, SearchHit } from "./types";

const providers: Record<MediaType, Provider> = {
  movie: tmdbProvider,
  tv: tmdbTvProvider,
  book: localBookProvider,
  game: steamProvider,
};

export function getProvider(type: MediaType): Provider {
  return providers[type];
}
