# ShepherdOS Mobile

The ShepherdOS church management app for iPhone and Android. It keeps the church's records on the phone, so it works with no internet, and syncs with the ShepherdOS server whenever there's a connection.

## Status

Phase 1, the foundation, is built:

- Sign-in with the ShepherdOS account, two-step (2FA) codes, and a church picker for people in more than one church.
- Offline start-up. After the first sync, the app opens straight into the church from what's on the phone, even with no signal.
- The sync engine:
  - Pulls changes since the last sync, page by page, and removes records the person can no longer see.
  - Queues changes made offline and sends them in order when back online.
  - Refused changes are kept for the person to retry or discard.
- Members (search, status filters, the member's page with call / SMS / WhatsApp) and household names, all from the phone's database.
- Subscription handling:
  - A renewal-due or grace-period banner on Home.
  - A closed screen with WhatsApp / call / email buttons when the church is locked, suspended or waiting for approval.
- An optional Face ID / fingerprint lock, a sync indicator on every screen, and light and dark themes.

Next phases add the rest of ShepherdOS: editing members offline, attendance and check-in, giving and finance, events, groups, tasks, announcements, pastoral care, scripture projection and reports.

## Running it

You need Node 20 or newer and the **Expo Go** app on your phone.

```bash
npm install
npm start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). The app signs in to `https://shepherdoss.vercel.app` by default. Change it under **Server** on the sign-in screen, for example to your computer's address while running ShepherdOS locally.

The server must include the mobile sign-in and `/api/v1/sync` endpoints (ShepherdOS pull request "Mobile app: session header and offline sync").

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # sync engine unit tests
npx expo export --platform android --platform ios   # makes sure both apps bundle
```

## Building for the stores

Builds use EAS (Expo's build service). No Xcode or Android Studio is needed.

```bash
npx eas-cli@latest build --profile preview --platform android    # an APK to install directly
npx eas-cli@latest build --profile production --platform all     # store builds
npx eas-cli@latest submit --platform ios                         # send to App Store Connect / TestFlight
```

The app id is `com.shepherdos.app`. Change it in `app.json` before the first store build if you want another.

## How it works

| Piece | Where |
|---|---|
| Screens (routes only) | `src/app` (Expo Router) |
| Screen bodies | `src/screens` |
| Shared UI | `src/components` |
| API client: the session is sent as `Authorization: Session <token>`, kept in the keychain / keystore | `src/lib/api.ts`, `src/lib/secure.ts` |
| Database on the phone (SQLite): records, sync cursors, the outbox of offline changes | `src/lib/db.ts` |
| Sync rules (tested on their own) | `src/lib/sync-core.ts` |
| Sync engine: when to sync, sending queued changes, pulling | `src/lib/sync.ts` |
| Sign-in state | `src/lib/auth.tsx` |
| Face ID / fingerprint lock | `src/lib/lock.tsx` |

**Security**
- The server applies the same permissions and field rules to sync as to the website, so the phone only ever holds what that person may see.
- Signing out or switching church wipes the church's data from the phone.
- The session token never touches plain storage.

**Subscriptions**
- Churches subscribe and renew through the ShepherdOS team, as on the website. The app checks the church's status on every start and sync.
- There are no in-app purchases yet. Selling digital subscriptions inside the app would have to go through Apple's and Google's billing.
