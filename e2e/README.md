# Phone simulator tests

These run the app's own sync code (phone database, offline queue, check-ins,
card scanning) in Node, against a real ShepherdOS server, switching the network
off and on. Phone-only parts are swapped for equivalents in `phone-mocks.ts`:
SQLite for the phone database, memory for the keychain, and a fetch that can go
"airplane mode".

## Running them

1. Run ShepherdOS locally (in the `shepherdos` folder) with the sample church:

   ```bash
   pnpm seed
   pnpm build && pnpm start
   ```

2. From this folder, run the tests with the ShepherdOS project's copy of vitest
   (npm currently fails to add vitest to this project; see below):

   ```bash
   E2E_SERVER=http://localhost:3000 E2E_HMAC_SECRET=<HMAC_SECRET from ShepherdOS's .env.local> \
     ../shepherdos/node_modules/.bin/vitest run --root . --config e2e/vitest.config.mjs
   ```

   `E2E_HMAC_SECRET` is only needed for the card-scanning test (it makes valid
   member cards); without it that test is skipped.

The server limits sign-ins to 10 per account every 15 minutes, so don't run them
in a tight loop (on a local test database you can clear the `ratelimits`
collection between runs). Use a local or staging server, never production: the tests
create services, members and households.

`npm install -D vitest` currently crashes inside npm ("Cannot read properties of
null (reading 'edgesOut')"), an npm bug with this project's dependency tree,
which is why vitest isn't a dependency here.
