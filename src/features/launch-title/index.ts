// Public API for the launch-title feature (starting a stream for a
// catalog title via its remembered/chosen provider). Consumers outside
// this slice import from here, not from model/launchCatalogTitle directly.
export {
  launchWithProvider,
  isPreferenceAvailable,
} from './model/launchCatalogTitle';

export type {TitleShortcutSnapshot} from './model/shortcut';
export {
  getTitleProductId,
  getTitleStreamingId,
  saveTitleShortcutSnapshot,
  findTitleByProductId,
  buildShortcutRequest,
  requestTitleShortcut,
} from './model/shortcut';
