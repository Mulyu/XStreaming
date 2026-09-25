import axios from 'axios';
import {getSettings} from '../../../shared/lib/settings';
import {debugFactory} from '../../../utils/debug';

const log = debugFactory('catalog-title/xcloudCatalogApi.js');

// xCloud's catalog/title-browsing endpoints, split out of the old
// xCloud/index.ts god-class -- these never shared XcloudSessionClient's
// session state (sessionId, isStoped, auth-retry) and produce exactly the
// title data entities/catalog-title's other caches (xcloudCache, priceCache,
// ...) already key on, so they live here instead.
export default class XcloudCatalogApi {
  private readonly host: string;
  private readonly gsToken: string;

  constructor(host: string, gsToken: string) {
    this.host = host;
    this.gsToken = gsToken;
  }

  getOfficialTitles(): Promise<any[]> {
    return new Promise(resolve => {
      let officialTitles: any[] = [];
      axios
        .get('https://cdn.jsdelivr.net/gh/Geocld/XStreaming@main/titles.json', {
          timeout: 30 * 1000,
        })
        .then(res => {
          if (res.status === 200) {
            officialTitles = res.data.Products;
            // console.log('officialTitles:', officialTitles);
          }
          resolve(officialTitles);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  getGamePassProducts(titles: any[]): Promise<any[]> {
    return new Promise(resolve => {
      const productIdQueue: string[] = [];
      const v2TitleMap: Record<string, any> = {};
      if (!Array.isArray(titles)) {
        log.info('[getGamePassProducts] error titles is not a array:', titles);
        resolve([]);
      }
      titles.forEach(title => {
        if (title.details && title.details.productId) {
          productIdQueue.push(title.details.productId);
          v2TitleMap[title.details.productId] = title;
        }
      });

      // Get officialTitles
      this.getOfficialTitles().then(officialTitles => {
        // Fix: v2/titles API can not get full games
        this.getCatalogGames(productIdQueue, v2TitleMap).then(titles1 => {
          this.getCatalogGames(officialTitles, v2TitleMap).then(titles2 => {
            let mergedTitles = [...titles1, ...titles2];
            mergedTitles.sort((a, b) =>
              a.ProductTitle.localeCompare(b.ProductTitle),
            );
            mergedTitles = mergedTitles.reduce((acc, current) => {
              const exists = acc.find(
                (item: any) => item.ProductTitle === current.ProductTitle,
              );
              if (!exists) {
                acc.push(current);
              }
              return acc;
            }, []);
            resolve(mergedTitles);
          });
        });
      });
    });
  }

  getCatalogGames(
    prods: string[] = [],
    v2TitleMap: Record<string, any> = {},
  ): Promise<any[]> {
    const _settings = getSettings();
    // Localize the catalog titles with the user's preferred game language so
    // titles match the (already localized) descriptions. The catalog uses
    // zh-TW for Chinese; every other language is passed through as-is (falling
    // back to en-US). Market stays US so the available title set is unchanged.
    const preferred = _settings.preferred_game_language || 'en-US';
    const lang = preferred.indexOf('zh') > -1 ? 'zh-TW' : preferred;
    return new Promise(resolve => {
      axios
        .post(
          `https://catalog.gamepass.com/v3/products?market=US&language=${lang}&hydration=RemoteLowJade0`,
          {
            Products: [...prods],
          },
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'ms-cv': 0,
              'calling-app-name': 'Xbox Cloud Gaming Web',
              'calling-app-version': '24.17.63',
            },
          },
        )
        .then(res => {
          console.log('POST catalog.gamepass.com/v3/products success');
          if (res.data && res.data.Products) {
            const products = res.data.Products;
            let mergedTitles: any[] = [];
            for (const key in products) {
              if (v2TitleMap[key]) {
                mergedTitles.push({
                  productId: key,
                  ...products[key],
                  ...v2TitleMap[key],
                });
              } else {
                mergedTitles.push({
                  productId: key,
                  ...products[key],
                });
              }
            }
            mergedTitles.sort((a, b) =>
              a.ProductTitle.localeCompare(b.ProductTitle),
            );
            mergedTitles = mergedTitles.filter(item => {
              return item.titleId || item.XCloudTitleId;
            });
            resolve(mergedTitles);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('getGamePassProducts error:', e);
          // reject(e);
          resolve([]);
        });
    });
  }

  // Get all games of XGPU
  getTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
      axios
        .get(`${this.host}/v2/titles`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          resolve(res.data);
        })
        .catch(e => {
          log.info('getTitles error: ', e);
          resolve([]);
        });
    });
  }

  // Get recently add games of XGPU
  getNewTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
      axios
        .get(
          'https://catalog.gamepass.com/sigls/v2?id=f13cf6b4-57e6-4459-89df-6aec18cf0538&market=US&language=en-US',
        )
        .then(res => {
          resolve(res.data);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  // Fetch original release dates from the Microsoft display catalog. Returns a
  // map of productId (bigId) -> ISO date string. The Game Pass catalog
  // (RemoteLowJade0) carries no dates, so we enrich from displaycatalog, which
  // exposes MarketProperties[].OriginalReleaseDate. Batched (bigIds is capped),
  // best-effort: unknown/failed products are simply omitted.
  getReleaseDates(productIds: string[]): Promise<Record<string, string>> {
    const unique = Array.from(new Set(productIds.filter(Boolean)));
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 40) {
      chunks.push(unique.slice(i, i + 40));
    }
    return new Promise(resolve => {
      const result: Record<string, string> = {};
      Promise.all(
        chunks.map(chunk =>
          axios
            .get('https://displaycatalog.mp.microsoft.com/v7.0/products', {
              params: {
                bigIds: chunk.join(','),
                market: 'US',
                languages: 'en-US',
                fieldsTemplate: 'details',
              },
              headers: {'MS-CV': '0'},
              timeout: 30 * 1000,
            })
            .then(res => {
              const products = res.data?.Products || [];
              products.forEach((p: any) => {
                const id = p.ProductId;
                const date = p.MarketProperties?.[0]?.OriginalReleaseDate;
                if (id && date) {
                  result[id] = date;
                }
              });
            })
            .catch(() => {}),
        ),
      ).then(() => resolve(result));
    });
  }

  // Get recently play games of user
  getRecentTitles(): Promise<any[]> {
    return new Promise<any[]>(resolve => {
      axios
        .get(`${this.host}/v2/titles/mru?mr=25`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          // log.info('getRecentTitles res:', res.data);
          resolve(res.data);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  // Get alternate ids
  getAlternateIds(id: string): Promise<any[]> {
    return new Promise(resolve => {
      axios
        .post(
          `${this.host}/v2/titles`,
          {
            alternateIdType: 'productId',
            alternateIds: [id],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + this.gsToken,
            },
          },
        )
        .then(res => {
          console.log('res.data:', res.data);
          resolve(res.data || []);
        })
        .catch(() => {
          resolve([]);
        });
    });
  }

  getConsoles(): Promise<any[]> {
    return new Promise(resolve => {
      const deviceInfo = JSON.stringify({
        appInfo: {
          env: {
            // clientAppId: 'Microsoft.GamingApp',
            // clientAppType: 'native',
            // clientAppVersion: '2203.1001.4.0',
            // clientSdkVersion: '8.5.2',
            // httpEnvironment: 'prod',
            // sdkInstallId: '',
            clientAppId: 'www.xbox.com',
            clientAppType: 'browser',
            clientAppVersion: '26.1.97',
            clientSdkVersion: '10.3.7',
            httpEnvironment: 'prod',
            sdkInstallId: '',
          },
        },
        dev: {
          hw: {
            make: 'Microsoft',
            // 'model': 'Surface Pro',
            model: 'unknown',
            // 'sdktype': 'native',
            sdktype: 'web',
          },
          os: {
            name: 'windows',
            ver: '22631.2715',
            platform: 'desktop',
          },
          displayInfo: {
            dimensions: {
              widthInPixels: 1920,
              heightInPixels: 1080,
            },
            pixelDensity: {
              dpiX: 1,
              dpiY: 1,
            },
          },
          browser: {
            browserName: 'chrome',
            browserVersion: '130.0',
          },
        },
      });
      axios
        .get(`${this.host}/v6/servers/home?mr=50`, {
          headers: {
            'Content-Type': 'application/json',
            'X-MS-Device-Info': deviceInfo,
            Authorization: 'Bearer ' + this.gsToken,
          },
        })
        .then(res => {
          log.info('getConsoles res:', res.data);
          if (res.data && res.data.results) {
            resolve(res.data.results);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('xcloudapi getConsoles err:', e);
          resolve([]);
        });
    });
  }
}
