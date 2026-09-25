// Monotonic build number stamped by CI at release time.
//
// The GitHub Actions workflow (.github/workflows/build-android.yml) overwrites
// this file with the run number before building, and the rolling "latest"
// GitHub Release is named "Latest APK (build <run_number>)". The in-app updater
// compares the release's build number against this value to decide whether a
// newer sideload build is available — no semver/tag bump required.
//
// Local/dev builds keep 0, so any CI release is treated as newer.
export const BUILD_NUMBER = 0;
