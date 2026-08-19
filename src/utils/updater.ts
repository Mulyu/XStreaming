import axios from 'axios';
import pkg from '../../package.json';
import {BUILD_NUMBER} from './buildInfo';

const CHECK_URL = 'https://api.github.com/repos/Mulyu/XStreaming/releases';
const APK_ASSET_PATTERN = /\.apk$/i;
const PROD_ASSET_PATTERN = /(prod|release)/i;
// The rolling release is named "Latest APK (build <n>)" by the CI workflow.
const BUILD_NUMBER_PATTERN = /build\s+(\d+)/i;

const formatMdString = (md: string) => {
  if (!md) {
    return '';
  }
  return md
    .replace(/##\s/g, '')
    .replace(/\r\n---\r\n/g, '\n')
    .replace(/\[([^\]]+)\]$([^)]+)$/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/^-\s/gm, '• ');
};

// Distribution uses a single rolling "latest" pre-release whose tag never
// changes, so semver on the tag can't detect new builds. Instead we compare the
// CI build number embedded in this app (buildInfo.BUILD_NUMBER) against the one
// encoded in the release name, and offer the update when the release is newer.
const updater = () => {
  const {version} = pkg;
  return new Promise(resolve => {
    axios
      .get(CHECK_URL)
      .then(res => {
        if (res.status !== 200) {
          resolve(false);
          return;
        }
        const releases = Array.isArray(res.data) ? res.data : [];
        if (releases.length === 0) {
          resolve(false);
          return;
        }

        // Prefer the rolling "latest" release; fall back to the newest one.
        const release =
          releases.find((r: any) => r?.tag_name === 'latest') || releases[0];

        const nameMatch = BUILD_NUMBER_PATTERN.exec(release?.name || '');
        const remoteBuild = nameMatch ? parseInt(nameMatch[1], 10) : NaN;
        if (!Number.isFinite(remoteBuild) || remoteBuild <= BUILD_NUMBER) {
          // Can't tell, or not newer than what's installed.
          resolve(false);
          return;
        }

        const assets = Array.isArray(release.assets) ? release.assets : [];
        const apkAsset =
          assets.find(
            (asset: any) =>
              APK_ASSET_PATTERN.test(asset?.name || '') &&
              PROD_ASSET_PATTERN.test(asset?.name || ''),
          ) ||
          assets.find((asset: any) =>
            APK_ASSET_PATTERN.test(asset?.name || ''),
          );
        if (!apkAsset) {
          resolve(false);
          return;
        }

        resolve({
          latestVer: `build ${remoteBuild}`,
          version: BUILD_NUMBER ? `build ${BUILD_NUMBER}` : version,
          updateText: formatMdString(release.body),
          url: release.html_url,
          pageUrl: release.html_url,
          apkUrl: apkAsset?.browser_download_url || '',
          apkName: apkAsset?.name || '',
        });
      })
      .catch(e => {
        console.log('Check version error:', e);
        resolve(false);
      });
  });
};

export default updater;
