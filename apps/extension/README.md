# LinkedIn → Attio extension

Chrome MV3 extension that holds nothing but your LinkedIn browser session. It asks
the backend (`apps/web`) what to fetch, runs those LinkedIn requests with your
cookies, and posts the raw responses back. All parsing and Attio writes happen on
the backend, so most LinkedIn changes are fixed with a server deploy.

## How it works

- **Sign in with Attio** (`lib/auth.ts`): `chrome.identity.launchWebAuthFlow` opens
  `GET /api/auth/attio/start` on the backend, which runs Attio OAuth and redirects to
  `https://<extension-id>.chromiumapp.org/attio#token=…`. The session token is stored
  in `settings` and sent as `Authorization: Bearer` on every call. A 401 anywhere ends
  the session: syncing stops, the badge shows a grey `?`, and the popup asks to sign in
  again. First install opens the options page as a welcome page.
- **Sync loop** (`lib/sync.ts`): `POST /api/sync` with the last batch of results →
  run the `next` requests from the response (max 25 per tick, 1–3 s apart) → repeat
  until `next` is empty → sleep for `pollAfterMs` (minimum 1 minute) via
  `chrome.alarms`. Unsent results are persisted so a service-worker restart loses
  nothing.
- **Request config**: named requests are built from `GET /api/linkedin/config`
  (cached; refetched when the backend reports a new `configVersion`; falls back to
  the config bundled from `@linkedin-sync/core`). Any built URL not on
  `https://www.linkedin.com` is refused.
- **Session strategies** (`lib/linkedin-fetch.ts`): first a service-worker `fetch`
  with `credentials: 'include'` and `csrf-token` from the `JSESSIONID` cookie; if
  that fails with a CSRF error, a redirect/HTML page, or a network error, the same
  request runs inside an open linkedin.com tab (`world: 'MAIN'`). Whichever works is
  remembered. With neither available the backend gets
  `{ status: 0, body: { error: 'no_session_context' } }`.
- **Observed requests** (`lib/observed.ts`): the linkedin.com content script reports
  the messaging GraphQL paths LinkedIn's own web app used (ids scrubbed), so a
  rotated `queryId` can be fixed by the self-heal agent.
- **Attio prompt** (`entrypoints/linkedin.content/`): a card in the bottom-right of
  linkedin.com for each pending link: pick a suggested Attio person, search, create a
  new person, snooze for 24 h, or never ask for that conversation.
- **Sync to Attio button** (`entrypoints/linkedin.content/thread-button.ts`): a pill
  under the card on `linkedin.com/messaging/thread/<threadId>/` pages. It runs its own
  short loop with `POST /api/conversations/sync` (look the thread up if needed, fetch
  it, post the results back) instead of waiting on the background sync: it rewrites
  the note for a linked thread and brings up the Attio picker for an unlinked one.
- **Badge**: grey `?` = signed out, red `!` = log in to LinkedIn, amber `…` = backend is
  self-repairing, a number = conversations waiting for an Attio match.
- **Updates**: the popup compares the installed version with `GET /api/me`'s
  `extension.latestVersion` and links to the download when it's behind.

## Develop

```sh
pnpm --filter extension dev     # launches Chrome with the extension and HMR
pnpm --filter extension build   # → apps/extension/dist/chrome-mv3
pnpm --filter extension exec tsc --noEmit
```

The build points at `WXT_BACKEND_URL` and gets host permission for it at install.
Without it, a local build targets `http://localhost:3000` (`next dev`). The web app's
build sets it to the deployment's own URL when it packages the `/install` download, so
teammates never build this themselves. To build against your deployment by hand, run
`WXT_BACKEND_URL=https://<your-backend> pnpm --filter extension build`. You can also
override the backend at runtime under **Advanced** on the options page (that signs you out).

## Load unpacked

1. `pnpm --filter extension build`
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
   pick `apps/extension/dist/chrome-mv3`.
3. The welcome page opens: click **Sign in with Attio** and approve.

## Manual test checklist

1. **Sign-in**: fresh install opens the welcome page; *Sign in with Attio* returns
   with *Signed in as …*. Closing the Attio window does nothing; a different workspace
   shows the wrong-workspace message.
2. **Session strategy**: with a linkedin.com tab closed, click *Sync now* in the
   popup. Inspect the service worker (`chrome://extensions` → *service worker*):
   `chrome.storage.local.get('fetchStrategy')` shows `worker` if cookie-bearing
   service-worker fetches work. If it shows `tab` (or results come back as
   `no_session_context`), open linkedin.com and sync again. That tells you which
   strategy your Chrome allows.
3. **Sync**: backend receives `me`, then `conversations`, then `messages` results;
   the popup shows *Syncing* and a recent *Last sync*.
4. **Observed requests**: open linkedin.com/messaging, wait ~5 s, then check
   `chrome.storage.local.get('observedRequests')`: paths contain `queryId=` and
   `{profileId}` placeholders, never real `ACoA…` ids.
5. **Attio prompt**: reply to someone who isn't linked yet. After the next sync the
   card appears on linkedin.com. Check each path: *This is them*, search +
   pick, *Create*, *Not now* (card hides; returns after 24 h), and
   *Never for this conversation*.
6. **Sync to Attio button**: open a thread. The pill appears bottom-right and hides
   again on non-thread pages (switch threads without reloading, since LinkedIn is an
   SPA). Switch threads and click straight away: it must sync the thread now on
   screen, not the previous one. Try it on a linked thread (*Syncing…* → *Synced to
   Attio ✓* within a few seconds), an unlinked one (its card jumps to the front, pill
   says *Pick the Attio person below*), an old thread outside the inbox page, and a group
   chat (backend's *unsupported* message). Signed out, the pill reads *Sign in to sync
   to Attio* and opens the welcome page.
7. **Auth**: log out of LinkedIn and sync. The badge turns red `!` once the backend
   reports `auth_required`.
