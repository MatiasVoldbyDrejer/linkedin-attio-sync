# Team setup

Teammates install a Chrome extension, sign in with Attio, and use LinkedIn as usual. Setup has two parts: a one-time admin setup, then about two minutes per teammate.

## For the admin (once)

Below, `<your-backend>` is the domain your backend is deployed on, the same value as `PUBLIC_BASE_URL` (see the root README).

### 1. Create the Attio OAuth app

Sign-in with Attio needs an OAuth app registered in Attio.

1. Go to [build.attio.com](https://build.attio.com) and create an app, for example "LinkedIn Sync".
2. Open **OAuth** in the app's sidebar.
3. Add this **redirect URI**:
   ```
   https://<your-backend>/api/auth/attio/callback
   ```
4. Select the scope **`user_management:read`**. It's all sign-in needs: it lets the backend look up your name and email. Syncing writes to Attio through the backend's existing access token, not through each person's sign-in.
5. Optionally set **OAuth flow URL** to `https://<your-backend>/install`.
6. Copy the **Client ID** and **Client Secret**.

### 2. Give them to the backend

Add both values yourself, so the secret stays out of chat logs and the repo:

```bash
cd apps/web
vercel env add ATTIO_OAUTH_CLIENT_ID production
vercel env add ATTIO_OAUTH_CLIENT_SECRET production
```

Then redeploy so production picks them up (`vercel redeploy <latest production URL> --target production`, or push to `main`).

### 3. Share the install page

Send teammates `https://<your-backend>/install`. It always offers the build that matches the deployed backend.

## For teammates

1. Open your team's install page (`https://<your-backend>/install`, your admin shares the link), download the extension and unzip it somewhere permanent.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. On the welcome page that opens, click **Sign in with Attio** and approve with your account in the team workspace.
4. Open [linkedin.com/messaging](https://www.linkedin.com/messaging/). When you reply to someone who isn't linked yet, a card asks which Attio person it is. Any thread also has a **Sync to Attio** button. Click the extension's toolbar icon any time to open its side panel with sync status.

**Updating:** when the extension says a new version is out, download it again and replace the folder. Click the reload arrow on the extension in `chrome://extensions`, then hard-refresh open LinkedIn tabs (⌘⇧R).

## Troubleshooting

**"Wrong workspace" when signing in.**
You approved with an Attio account that isn't in the team workspace. On Attio's screen, switch to the team workspace or account and sign in again.

**The card or the Sync to Attio button doesn't show.**
Hard-refresh the LinkedIn tab (⌘⇧R). Tabs that were open before you installed or reloaded the extension keep running the old version until they're refreshed. Also click the extension's toolbar icon and check that its side panel says you're signed in.

**It worked before an update and now doesn't.**
Make sure you replaced the folder Chrome loads from, not just downloaded the zip. Click reload on `chrome://extensions` and refresh LinkedIn tabs. If Chrome lists the extension twice, remove the older copy.

**The side panel says to log in to LinkedIn.**
LinkedIn signed you out or wants to verify you. Open linkedin.com, log in, and it resumes within a few minutes.
