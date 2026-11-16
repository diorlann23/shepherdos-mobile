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

Phase 6, reports, is built (scripture projection stays on the website and isn't part of the app):

- **Reports** (More › Ministry › Reports), for roles that can see reports.
  - Every built-in report the person may run, grouped by area. Each has the website's filters (dates, branch or region, options).
  - Results show the summary figures, a chart (horizontal bars, made for a phone screen) and the table.
  - Reports are worked out on the server, so running one needs a connection. The last 30 results are kept on the phone and open offline ("Kept on this phone").
  - **Share as PDF, Excel or CSV** through the phone's share sheet (WhatsApp, email, Drive…), for roles allowed to export. The file is made by the website, with the church's letterhead on PDFs.
- **Branch reports** (the forms each level submits upwards):
  - To fill in, to review, and recent ones.
  - Starting one needs a connection (the server fills it in from the church's figures for the period). Answering, saving and submitting then work offline.
  - Reviewers at the level above approve, mark reviewed or return with a note. The submitter can't review their own report; the server enforces it.

### App icon, notifications and test builds

- **Icon and splash screen**: the ShepherdOS emblem (crook, house, cross, lamb and open Bible) from the website, on white. Android gets an adaptive icon (with a one-colour version for themed icons) and a notification icon. In dark mode the splash shows the emblem on its own white tile, as on the website.
- **Push notifications**: the same alerts as the bell on the website, on the phone's lock screen:
  - an expense waiting for approval, and the decision on yours;
  - a new task, or one due soon;
  - a first-timer assigned to you;
  - a branch report returned for changes, or approved;
  - a counting sheet ready for a second person to verify (new: the website now sends this too).
  - Tapping one opens that task, expense, counting sheet, event or report in the app.
  - The phone gets only the notifications of the church it's signed in to. Signing out (here or with "sign out everywhere" on the website) stops them.
  - **More → Notifications** shows whether they're on, and opens the phone's settings if they were turned off.
- **Installable test builds** with EAS. See [Test builds](#test-builds) below.

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

## Test builds

Builds use EAS (Expo's build service, free plan is enough for test builds). No Xcode or Android Studio is needed. Builds run in Expo's cloud and take 10–20 minutes.

**Once, on your computer:**

```bash
npm run eas:login     # sign in with your Expo account
npm run eas:init      # links this app to an Expo project; adds its projectId to app.json (commit that change)
```

**Android: an APK you install directly**

```bash
npm run build:android
```

When it finishes, EAS prints a link and a QR code. Open it on the Android phone, download the APK and install it (allow "install unknown apps" for your browser when asked). Send the same link to other testers.

**iPhone: needs an Apple Developer account** ($99 a year, developer.apple.com)

- TestFlight (easiest for testers):

  ```bash
  npm run build:testflight
  ```

  EAS asks you to sign in to Apple and creates the certificates for you. The build is sent to App Store Connect; add testers in TestFlight there.
- Or a direct install on registered iPhones: `npx eas-cli@latest device:create` (each tester opens the link once), then `npm run build:ios`.

### Turning on push notifications

Push notifications only arrive in an installed build (the APK or TestFlight), not in Expo Go on Android. They need `npm run eas:init` first (the app finds its project id there), then:

- **iPhone**: nothing extra. During the first iOS build, answer **Yes** when EAS asks to set up push notifications.
- **Android** (pushes go through Google's Firebase):
  1. At console.firebase.google.com, create a project and add an **Android app** with package name `com.shepherdos.app`.
  2. Download its `google-services.json`. Upload it to EAS as a file variable (keeps it out of git):

     ```bash
     npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment preview --environment production --environment development
     ```

  3. In Firebase: Project settings → Service accounts → **Generate new private key**. Then run `npx eas-cli@latest credentials`, choose Android → `com.shepherdos.app` → Google Service Account → **FCM V1**, and upload that key file.
  4. Build again (`npm run build:android`).

The website needs no setup to send them. If you later turn on "Enhanced push security" for the Expo project, add the access token as `EXPO_ACCESS_TOKEN` in the website's environment variables.

### Store releases

```bash
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
