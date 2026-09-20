# Vendored chiaki-ng / Pylux (PS Plus cloud streaming)

This directory vendors the parts of [Pylux](https://github.com/ForWard-Technologies-LLC/Pylux)
(itself a fork of [chiaki-ng](https://github.com/streetpea/chiaki-ng)) needed to drive PS Plus
Premium cloud streaming from XStreaming's Android app: the core protocol/crypto/codec engine
(`lib/`), its bundled dependencies (`third-party/`), the CMake `Find*` modules it needs
(`cmake/`), and the Android JNI bridge (`jni/`, plus the Kotlin wrapper at
`android/app/src/main/java/com/xstreaming/psplus/Chiaki.kt`).

Both upstream projects are **AGPL-3.0-only, with an OpenSSL linking exception** -- see
`/COPYING` at the repo root for the full text and what that means for this project as a whole.

## What's vendored vs. what's new

- `lib/`, `lib/protobuf/`, `third-party/{nanopb,jerasure,gf-complete,curl}/`, `cmake/`,
  `jni/{chiaki-jni.c,*.h,video-decoder.*,audio-decoder.*,opus-decoder.*,audio-output.*,log.*,
  circular-fifo.hpp,oboe/}` and `android/app/src/main/java/com/xstreaming/psplus/Chiaki.kt`
  are vendored as close to verbatim as possible from Pylux, just relocated and with the JNI
  package/class target retargeted from `com.metallic.chiaki.lib.ChiakiNative` to
  `com.xstreaming.psplus.ChiakiNative` (`BASE_PACKAGE`/`JNI_FCN` in `jni/chiaki-jni.h`).
  `third-party/{nanopb,jerasure,gf-complete,curl}` and `jni/oboe` are pinned to the exact
  commits Pylux's own `.gitmodules` references.
- `CMakeLists.txt` (this directory) and `jni/CMakeLists.txt` are new, purpose-built files
  replacing Pylux's own multi-platform root CMakeLists.txt (which also builds a Qt GUI, CLI,
  Nintendo Switch/Borealis, Steam Deck native and Steamworks targets XStreaming has no use
  for) -- they hardcode the one configuration this project needs (Android + chiaki-lib +
  its JNI bridge) instead of exposing it all as toggles.
- Everything under `android/app/src/main/java/com/xstreaming/psplus/` other than `Chiaki.kt`
  (`PsPlusModule.kt`, `PsPlusStreamView.kt`, `PsPlusStreamViewManager.kt`, `PsPlusPackage.kt`)
  and `src/psplus/` (TypeScript) are new React Native bridge code written for this project,
  not vendored from Pylux.
- Deliberately not ported: console pairing/registration (`regist.*`), local network discovery
  (`discoveryservice.*`) and PSN Remote Play holepunch (`remote/holepunch.*`) -- this is a
  cloud-streaming-only integration, no physical PS4/PS5 console involved. That code still
  compiles in as part of the vendored `chiaki-lib` (splitting it out of the vendored source
  wasn't worth the risk), it's just never called from XStreaming's Kotlin/JS side.

## Build prerequisites

Beyond XStreaming's normal Android toolchain, building this target needs:

- **`protoc`** (the Protocol Buffers compiler) on `PATH`, or Python's `grpc_tools.protoc`
  importable -- `lib/protobuf/CMakeLists.txt` needs one of the two to compile `takion.proto`.
- **Python's `protobuf` package** (`pip install protobuf`) -- nanopb's own generator script
  (invoked next, to turn the compiled `.pb` into `takion.pb.c`/`.h`) imports
  `google.protobuf.text_format` regardless of which of the two `protoc`s produced the
  intermediate file.
- Network access during the CMake **configure** step: mbedTLS, curl, json-c, miniupnpc, opus,
  and the `nanopb`/`jerasure`/`gf-complete`/oboe sources are fetched from their upstream repos
  (mbedTLS/json-c/miniupnpc/opus via CMake `FetchContent`; the rest are vendored here already,
  pinned to Pylux's own submodule commits).

None of this is exotic -- it mirrors what Pylux's own CI needs -- but it's more than
XStreaming's existing native modules (react-native-webrtc, the bundled SDL2 `.so`) have ever
required, since this is the first C/C++ build in this repo that compiles third-party sources
from scratch rather than linking a prebuilt library.
