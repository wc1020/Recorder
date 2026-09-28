import type { Provider } from "./types";
import { ProviderNotConfiguredError } from "./types";

/** 图书纯本地：不搜远程、不刷新远程。 */
export const localBookProvider: Provider = {
  type: "book",
  source: "manual",

  async search(): Promise<never> {
    throw new ProviderNotConfiguredError("图书已改为纯本地，请手动添加");
  },

  async getDetail(): Promise<never> {
    throw new ProviderNotConfiguredError("图书已改为纯本地，无法从远程刷新");
  },
};
