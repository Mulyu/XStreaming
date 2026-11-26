import {NativeModules} from 'react-native';
import {getSettings} from '../../../shared/lib/settings';
import {debugFactory} from '../../../shared/lib/debug';

const log = debugFactory('catalog-title/xcloudCatalogApi.js');

const {CatalogXcloudModule} = NativeModules;

// Localize the catalog titles with the user's preferred game language so
// titles match the (already localized) descriptions. The catalog uses
// zh-TW for Chinese; every other language is passed through as-is (falling
// back to en-US). Market stays US so the available title set is unchanged.
// Settings/MMKV access stays in JS (see android's catalog Kotlin package
// doc comments), so this is resolved here and passed into the native calls
// that need it rather than read from Kotlin.
const resolveCatalogLang = (): string => {
  const preferred = getSettings().preferred_game_language || 'en-US';
  return preferred.indexOf('zh') > -1 ? 'zh-TW' : preferred;
};

// xCloud's catalog/title-browsing endpoints, split out of the old
// xCloud/index.ts god-class -- these never shared XcloudSessionClient's
// session state (sessionId, isStoped, auth-retry) and produce exactly the
// title data entities/catalog-title's other caches (xcloudCache, priceCache,
// ...) already key on, so they live here instead. The actual HTTP calls now
// live in android/app/src/main/java/com/xstreaming/catalog/
// XcloudCatalogClient.kt; this class forwards to CatalogXcloudModule,
// keeping its own class name/constructor/method signatures unchanged so
// every caller (loadXcloudCatalog.ts, useLibraryScreen.ts, pages/chart)
// needs zero changes.
export default class XcloudCatalogApi {
  private readonly host: string;
  private readonly gsToken: string;

  constructor(host: string, gsToken: string) {
    this.host = host;
    this.gsToken = gsToken;
  }

  async getOfficialTitles(): Promise<any[]> {
    try {
      return (await CatalogXcloudModule?.getOfficialTitles()) ?? [];
    } catch (e) {
      log.info('getOfficialTitles error:', e);
      return [];
    }
  }

  async getGamePassProducts(titles: any[]): Promise<any[]> {
    if (!Array.isArray(titles)) {
      log.info('[getGamePassProducts] error titles is not a array:', titles);
      return [];
    }
    try {
      return (
        (await CatalogXcloudModule?.getGamePassProducts(
          titles,
          resolveCatalogLang(),
        )) ?? []
      );
    } catch (e) {
      log.info('getGamePassProducts error:', e);
      return [];
    }
  }

  async getCatalogGames(
    prods: string[] = [],
    v2TitleMap: Record<string, any> = {},
  ): Promise<any[]> {
    try {
      return (
        (await CatalogXcloudModule?.getCatalogGames(
          prods,
          v2TitleMap,
          resolveCatalogLang(),
        )) ?? []
      );
    } catch (e) {
      log.info('getCatalogGames error:', e);
      return [];
    }
  }

  // Get all games of XGPU
  async getTitles(): Promise<any> {
    try {
      return await CatalogXcloudModule?.getTitles(this.host, this.gsToken);
    } catch (e) {
      log.info('getTitles error: ', e);
      return [];
    }
  }

  // Get recently add games of XGPU
  async getNewTitles(): Promise<any[]> {
    try {
      return (await CatalogXcloudModule?.getNewTitles()) ?? [];
    } catch (e) {
      return [];
    }
  }

  // Fetch original release dates from the Microsoft display catalog. Returns a
  // map of productId (bigId) -> ISO date string. The Game Pass catalog
  // (RemoteLowJade0) carries no dates, so we enrich from displaycatalog, which
  // exposes MarketProperties[].OriginalReleaseDate. Batched (bigIds is capped),
  // best-effort: unknown/failed products are simply omitted.
  async getReleaseDates(productIds: string[]): Promise<Record<string, string>> {
    try {
      return (await CatalogXcloudModule?.getReleaseDates(productIds)) ?? {};
    } catch (e) {
      log.info('getReleaseDates error:', e);
      return {};
    }
  }

  // Get recently play games of user
  async getRecentTitles(): Promise<any[]> {
    try {
      return (
        (await CatalogXcloudModule?.getRecentTitles(this.host, this.gsToken)) ??
        []
      );
    } catch (e) {
      return [];
    }
  }

  // Get alternate ids
  async getAlternateIds(id: string): Promise<any[]> {
    try {
      return (
        (await CatalogXcloudModule?.getAlternateIds(
          this.host,
          this.gsToken,
          id,
        )) ?? []
      );
    } catch (e) {
      return [];
    }
  }

  async getConsoles(): Promise<any[]> {
    try {
      return (
        (await CatalogXcloudModule?.getConsoles(this.host, this.gsToken)) ?? []
      );
    } catch (e) {
      log.info('xcloudapi getConsoles err:', e);
      return [];
    }
  }
}
