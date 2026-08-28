import type { MediaType } from "@/lib/constants";
import { googleBooksProvider } from "./google-books";
import { steamProvider } from "./steam";
import { tmdbProvider } from "./tmdb";
import type { Provider } from "./types";

export { ProviderNotConfiguredError } from "./types";
export type { ItemSnapshot, SearchHit } from "./types";

const providers: Record<MediaType, Provider> = {
  movie: tmdbProvider,
  book: googleBooksProvider,
  game: steamProvider,
};

export function getProvider(type: MediaType): Provider {
  return providers[type];
}
