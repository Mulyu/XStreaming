// Public API for the hub-tab-bar widget (the app's bottom tab bar, rendered
// once by the app layer and persisted across Library/Store/Settings tab
// switches). It's a widget rather than shared/ui or a feature's own UI since
// it hardcodes the app's own route names/icons -- an app-specific composite
// block, not a generic reusable primitive or one feature's concern. Consumers
// import from here, not from ui/HubTabBar directly.
export {default as HubTabBar} from './ui/HubTabBar';
