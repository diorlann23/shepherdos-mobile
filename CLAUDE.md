@AGENTS.md

## Project notes

- Expo SDK 58. Install packages with `npx expo install <pkg>`. If the version service is unreachable, use `EXPO_OFFLINE=1 npx expo install <pkg>`.
- Before declaring work done, run `npm run typecheck`, `npm test` and `npx expo export --platform android --platform ios`.
- The server is the ShepherdOS web app (Next.js). New offline collections need a matching entry in its `src/server/services/sync.ts` and in `SYNC_COLLECTIONS` and `INDEXERS` here.
- Installed apps get changes over the air (EAS Update, `runtimeVersion` policy `appVersion`). Any change that needs a new native build (native module, permissions/plugins/icon in `app.json`, SDK upgrade) must also raise `expo.version` in `app.json`, so that over-the-air updates never reach a build they don't fit.
