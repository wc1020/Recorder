import "@/lib/load-local-env";
import type { MediaType } from "@/lib/constants";

export type { MediaType };

export type SearchHit = {
  sourceId: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  subtitle: string | null;
};

export type ItemSnapshot = {
  type: MediaType;
  source: string;
  sourceId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  coverUrl: string | null;
  description: string | null;
  extraJson: string | null;
};

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export type Provider = {
  type: MediaType;
  source: string;
  search(query: string): Promise<SearchHit[]>;
  getDetail(sourceId: string): Promise<ItemSnapshot>;
};

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ProviderNotConfiguredError(`未配置：请在 local/.env 中设置 ${name}`);
  }
  return value;
}

export function yearFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function yearFromUnix(seconds: number | null | undefined): number | null {
  if (seconds == null) return null;
  const year = new Date(seconds * 1000).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}
