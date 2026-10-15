# Live browser-to-PostgreSQL verification

This is a separate, opt-in Playwright suite. Unlike `e2e/inventory.spec.ts`, it does **not** mock API responses: Chromium on desktop and mobile navigates the built web app, forwards API requests to a dedicated Express process, and persists changes in PostgreSQL.

**Never run this against production.** Both the test runner and the API use only `plutus_test`. The runner rejects any other database URL. Use a dedicated database and keep production service ports untouched.

```sh
export PATH=/opt/mcp/node-v24/bin:$PATH
export DATABASE_URL='postgresql://root@localhost/plutus_test?host=/var/run/postgresql'
npm run build
npm run test:api  # seeds isolated test-only IT login, clears ONLY plutus_test
npm run test:e2e:live
```

The live suite logs in as the isolated fixture IT manager, creates unique serialized assets, checks them out, returns them with a new location and validates browser-visible outcomes at desktop/mobile widths. Created fixture records are retained in the test database. The browsers use an in-process Playwright request forwarder to avoid changing Vite's production proxy configuration. This suite does not verify external Cloudflare, real LINE delivery or production sign-off.
