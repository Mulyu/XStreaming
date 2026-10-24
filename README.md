# AnyStreaming

An Android (and Android TV) client for cloud and console game streaming: Xbox Cloud Gaming and Xbox console streaming, GeForce NOW, and PS Plus cloud streaming, with one library across all of them.

> **Fork notice.** AnyStreaming is a fork of [Geocld/XStreaming](https://github.com/Geocld/XStreaming) (MIT), which was itself inspired by [Greenlight](https://github.com/unknownskl/greenlight). It is an independent project and is not affiliated with or endorsed by the original author.

> **Disclaimer.** AnyStreaming is not affiliated with Microsoft, Sony Interactive Entertainment, or NVIDIA. Xbox, PlayStation, and GeForce NOW are trademarks of their respective owners.

## Features

- Xbox Cloud Gaming (xCloud) and Xbox console streaming
- GeForce NOW and PS Plus cloud streaming
- One library across services: ownership, Game Pass / PS Plus catalog marks, store prices and sales
- Android TV support (D-pad navigation, long-press OK for details)
- Virtual, USB, and Bluetooth gamepads, rumble, physical keyboard and mouse

## Build

Requirements: [Node.js](https://nodejs.org/) 20 or later, [Yarn](https://yarnpkg.com/) 1.22 or later, and the Android SDK (React Native 0.72).

```
git clone https://github.com/Mulyu/XStreaming
cd XStreaming
yarn
npm run android
```

Checks that CI and contributors run:

```
npx tsc --noEmit
npx eslint .
npx jest
node scripts/check-tv-focus.js
```

Architecture notes are in [`.claude/knowledge/architecture.md`](./.claude/knowledge/architecture.md). Protocol notes inherited from the original project are in [`docs/`](./docs).

## License

AnyStreaming is licensed under the [GNU Affero General Public License v3.0](./COPYING) with an OpenSSL linking exception. The project moved from the original MIT license to AGPL-3.0 to include PS Plus streaming code adapted from [chiaki-ng](https://github.com/streetpea/chiaki-ng) and [Pylux](https://github.com/ForWard-Technologies-LLC/Pylux). The original MIT license and copyright notice of XStreaming (Copyright (c) 2024 Geocld) are preserved in [LICENSE](./LICENSE), which also explains how the two licenses apply to the code.
