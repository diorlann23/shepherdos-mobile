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

Phase 2, members and households offline, is built:

- Adding members with the full form or a quick first-timer form for the door. The forms follow the church's required and hidden field settings, and validate phone numbers, emails and dates the same way the server does.
- Editing members, a one-tap status change, and households: create, edit, add or remove people, and set the head.
- Changes show on the phone straight away and wait in the outbox:
  - Only the fields that changed are sent.
  - Someone added offline gets their real id and member number once synced, and later changes that point at them follow automatically.
  - A pull never overwrites a change still waiting to be sent.
- When the server refuses a change, the record's page shows why, with Fix, Discard, or (for a possible duplicate) Add anyway.
- Buttons appear only where the person's role allows. The server checks everything again.

Phase 3, attendance and check-in, is built:

- **Attendance tab:** today's services and recent ones (last 60 days) with their counts. Shown to people who take or see attendance, in churches with the feature.
- **Start a service:** pick its kind (Sunday Service…), where it's held (branch, region or group), the day, and whether to record names, a headcount or both.
- **Check people in:**
  - Search by name, member number or the last 4 phone digits, then tap to tick. Tap again to undo a mis-tap.
  - A people button checks in a whole household.
  - A **Here** list shows who's in, how and when.
- **Scan member cards with the camera:**
  - Online, the server checks each card, so forged or replaced cards are refused.
  - Offline, the phone reads the member from the card and checks them in.
- **First-timers at the door:** register and check in at once. They go on the follow-up list, as on the website.
- **Headcount** (men, women, children, first-timers, online, with the total added up) and **close / reopen** a service.
- **Fully offline, and never counted twice:**
  - Check-ins save on the phone and go in batches a few seconds after the last tap.
  - Each carries its own id, so retries and two ushers checking in the same person count once.
  - Services started offline, and people added offline, are checked in straight away and their real ids follow when synced.
- The check-in roster on the phone holds names, member numbers, households and the last 4 phone digits only, never full contact details. Its download is logged.

Not built yet: USSD check-in (see the design in the ShepherdOS repo, `docs/`).

Phase 4, giving and finance, is built:

- **A Finance tab** for people who handle giving or expenses, or see budgets. It has Giving, Expenses and Budgets, and a prompt to turn on the Face ID / fingerprint lock, since giving records are on the phone.
- **Giving:**
  - This month's total and giving by fund (from the server when online, the last figures otherwise), and the counting sheets of the last 120 days.
- **Counting sheets, offline:**
  - Start a sheet (optionally for a service) and count the notes and coins.
  - Add entries: a named giver from the register, or a loose offering, with fund, amount and how it was paid.
  - Submit, verify, post, reopen or void. The phone warns when cash entries don't match the cash counted.
  - The person who counted or started a sheet can't verify it, and posted sheets can't change. The server enforces both.
- **Expenses:**
  - Request one (send for approval or save as a draft).
  - Approvers see "Waiting for you", with Approve / Reject and a note. Approve only shows within the person's limit, and never on their own request.
- **Budgets:** each budget's spending against its total.
- **Never recorded twice:** every queued change carries its own key (an Idempotency-Key). If the connection drops after the server saved something, the retry gets the first answer back instead of saving it again.
- Amounts are kept in whole pesewas or cents, as on the website, so sums never drift.

Also from testing: lists the server doesn't offer yet (an older website) are skipped instead of stopping the whole sync.

Phase 5, the week's ministry work, is built. Everything is reached from **More › Ministry** and the "This week" card on Home, and shows only where the church has the feature and the role allows it:

- **Tasks:**
  - For me / I assigned.
  - Accept, start, mark done, verify, send back or cancel, with a note (the same moves the website allows; whoever did the work can't verify it).
  - Assign a new task to anyone the person may assign to.
- **Events:**
  - Upcoming and recent events, with when, where (opens in Maps) and registrations.
  - Register yourself, or (organisers) a member or guest with extra guests. A full event puts people on the waiting list.
  - Organisers see who registered.
- **Groups:** groups, cells and departments with their people. Leaders can take the group's attendance in one tap.
- **Notices:** the church's announcements for everyone. Writers publish new ones, optionally by email too.
- **First-timers:**
  - The follow-up board (new, contacted, visited, attending).
  - Call or WhatsApp, move to the next stage, add notes, assign to yourself, or close.
- **Prayer & visits:**
  - Add prayer requests and log pastoral visits offline.
  - **The words of requests and visit notes are never stored on the phone.** The list keeps who, when and status. The words travel only in the outbox (deleted once delivered) and are read online, one record at a time, by the people allowed to.
- **One request per sync:** all lists are asked for together (POST /sync), so syncing costs one request instead of one per list. Older servers are asked list by list.

Next: scripture projection and reports (phase 6), then the app's own icon, push notifications and installable test builds.

## Running it

You need **Node 22.13 or newer** (Expo SDK 58 won't run on Node 20) and the **Expo Go** app on your phone. With [nvm](https://github.com/nvm-sh/nvm), run `nvm install` in this folder: it reads `.nvmrc`.

```bash
npm install
npm start
```

Scan the QR code with Expo Go (Android) or the Camera app (iPhone). The app signs in to `https://shepherdoss.vercel.app` by default. Change it under **Server** on the sign-in screen, for example to your computer's address while running ShepherdOS locally.

The server must include the mobile sign-in and `/api/v1/sync` endpoints (ShepherdOS pull request "Mobile app: session header and offline sync").

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # unit tests: sync rules, the phone database, money, cards, validation
npx expo export --platform android --platform ios   # makes sure both apps bundle
```

The phone simulator (`e2e/`) runs the app's real sync code against a running ShepherdOS server, with the network switched off and on. See `e2e/README.md`.

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
