# AnyStreaming

An Android (and Android TV) client for cloud and console game streaming: Xbox Cloud Gaming and Xbox console streaming, and GeForce NOW, with one library across all of them.

> **Fork notice.** AnyStreaming is a fork of [Geocld/XStreaming](https://github.com/Geocld/XStreaming) (MIT), which was itself inspired by [Greenlight](https://github.com/unknownskl/greenlight). It is an independent project and is not affiliated with or endorsed by the original author.

> **Disclaimer.** AnyStreaming is not affiliated with Microsoft or NVIDIA. Xbox and GeForce NOW are trademarks of their respective owners.

## Features

- Xbox Cloud Gaming (xCloud) and Xbox console streaming
- GeForce NOW
- One library across services: ownership, Game Pass catalog marks, store prices and sales
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
node scripts/check-palette.js
```

All colours come from [`src/shared/config/palette.ts`](./src/shared/config/palette.ts); `check-palette.js` fails if a colour literal appears anywhere else in `src/`.

Architecture notes are in [`.claude/knowledge/architecture.md`](./.claude/knowledge/architecture.md). Protocol notes inherited from the original project are in [`docs/`](./docs).

## License

AnyStreaming is licensed under the [MIT License](./LICENSE), the same license as the upstream project it forked from (Copyright (c) 2024 Geocld).
