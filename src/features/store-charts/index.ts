// Public API for the store-charts feature (Xbox and Steam store browse/chart
// fetching used by the Store screen). Consumers outside this slice import
// from here, not from api/xboxBrowse or api/steamCharts directly.
export {
  fetchXboxBrowsePage,
  getFreshXboxBrowsePage,
  XBOX_BROWSE_PAGE_SIZE,
} from './api/xboxBrowse';
export type {XboxBrowseSort, XboxBrowsePage} from './api/xboxBrowse';

export {
  fetchSteamChart,
  getFreshSteamChart,
  STEAM_CHART_PAGE_SIZE,
} from './api/steamCharts';
export type {
  SteamChartKind,
  SteamChartEntry,
  SteamChartPage,
} from './api/steamCharts';
