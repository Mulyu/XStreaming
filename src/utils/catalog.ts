import XcloudApi from '../xCloud';
import {getXcloudData, saveXcloudData} from '../store/xcloudStore';

export type CatalogData = {
  titles: any[];
  titleMap: Record<string, any>;
  newTitles: any[];
  recentTitles: any[];
};

// Load the xCloud catalog (all titles + Game Pass products, new arrivals and
// recently played) and merge it into the shared xcloud cache. This mirrors the
// fetch the Cloud screen runs on mount, extracted so the Home dashboard can
// populate the cache too when it is the first screen after login.
export const loadCatalog = async (
  streamingTokens: any,
): Promise<CatalogData | null> => {
  const token = streamingTokens?.xCloudToken;
  if (!token) {
    return null;
  }

  const api = new XcloudApi(
    token.getDefaultRegion().baseUri,
    token.data.gsToken,
    'cloud',
  );

  const res: any = await api.getTitles();
  if (!res?.results || res.results.length === 0) {
    return null;
  }

  const titles: any[] = await api.getGamePassProducts(res.results);
  const titleMap: Record<string, any> = {};
  titles.forEach((item: any) => {
    titleMap[item.productId] = item;
  });

  const newTitleRes: any = await api.getNewTitles();
  const newTitles: any[] = [];
  (newTitleRes || []).forEach((item: any) => {
    if (
      item.id &&
      titleMap[item.id] &&
      (titleMap[item.id].titleId || titleMap[item.id].XCloudTitleId)
    ) {
      newTitles.push(titleMap[item.id]);
    }
  });

  const recentTitleRes: any = await api.getRecentTitles();
  const recentResults = recentTitleRes?.results || [];
  const recentTitles: any[] = [];
  recentResults.forEach((item: any) => {
    if (item.details && item.details.productId) {
      const productId = item.details.productId;
      const productIdUp = productId.toUpperCase();
      if (titleMap[productId] || titleMap[productIdUp]) {
        recentTitles.push(titleMap[productId] || titleMap[productIdUp]);
      }
    }
  });

  const cacheData = getXcloudData();
  saveXcloudData({
    ...cacheData,
    titles,
    titleMap,
    newTitles,
    recentTitles,
  });

  return {titles, titleMap, newTitles, recentTitles};
};
