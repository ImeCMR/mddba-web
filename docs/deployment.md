# Deployment

The site is built by [Eleventy](https://www.11ty.dev) into `_site/`, which is what gets published. Vercel builds it on every push, including the commits the editor (`/admin`) makes when someone saves.

## Vercel (current host)

`vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "_site",
  "cleanUrls": true,
  "trailingSlash": false
}
```

- Vercel runs `npm install` and then `npm run build`, and publishes `_site/`. The files in `api/` become serverless functions (`/api/auth`, `/api/callback`), used only by the editor's GitHub login.
- `cleanUrls` serves `/pages/news.html` at `/pages/news`. The relative `.html` links in the pages still work locally and redirect (308) to the clean URL on Vercel.
- `404.html` is used automatically for unknown URLs. It uses root-absolute paths (`/assets/...`) so it renders at any depth.
- Project settings:
  - Framework preset: **Other**.
  - Leave the build command and output directory empty in the dashboard; `vercel.json` sets them.
  - Root directory: the repository root (this folder).
  - Node.js 20 or newer.

## Editor login (one-time set-up)

The editor at `/admin` logs in with GitHub. Every save is a commit to the repository, so each editor needs a GitHub account with write access.

1. **Create a GitHub OAuth App.** Go to GitHub → Settings → Developer settings → OAuth Apps → *New OAuth App*. Use the account or organisation that owns `ImeCMR/mddba-web`.
   - Application name: `MDDB America website editor`
   - Homepage URL: the site address, e.g. `https://mddba.com`
   - Authorization callback URL: the same address + `/api/callback`, e.g. `https://mddba.com/api/callback`
2. **Copy the keys.** Copy the *Client ID*, then generate and copy a *Client secret*.
3. **Add them to Vercel.** In Vercel → the project → Settings → Environment Variables, add:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`

   Add them for the environment where you open the editor (Production, or Preview too). Then redeploy.
4. **Give editors access.** In GitHub → `ImeCMR/mddba-web` → Settings → Collaborators, add each editor with **Write** access.
5. **Check the branch.** `src/admin/config.yml` → `backend.branch` must be the branch Vercel publishes for the live site (`main`).

Open `https://<site>/admin/`, click **Login with GitHub** and approve the app once.

Notes:
- **`mddba.com` and `www.mddba.com`.** `mddba.com` redirects to `www.mddba.com`, so the editor runs at `https://www.mddba.com/admin` and asks GitHub to return to `https://www.mddba.com/api/callback`. GitHub accepts a sub-domain of the registered callback URL, so `https://mddba.com/api/callback` works too. If GitHub says *"The redirect_uri is not associated with this application"*, set the callback URL to the `www` address.
- **One callback URL per OAuth App.** A GitHub OAuth App has a single callback URL, so the editor logs in only on that address. Until mddba.com serves v2, register the v2 address from Vercel (e.g. `https://<project>-git-v2-<team>.vercel.app/api/callback`) and open the editor there. Switch the callback URL to mddba.com at launch.
- **Deployment Protection.** If Vercel's Deployment Protection is on for Preview deployments, the editor and `/api/*` on a preview URL ask for a Vercel login first. Turn it off for that URL, or use the editor on the production domain.
- **Running it locally.** Locally (`npm start` + `npm run cms`), the editor skips GitHub and edits the files in your working copy.

## Maintenance mode
`maintenance.html` is standalone (no nav or JS) and is copied to the output unchanged. To send all traffic to it, add a redirect like the one in the parent `12_mddb_web/vercel.json` to this folder's `vercel.json`:

```json
"redirects": [
  { "source": "/((?!maintenance|assets).*)", "destination": "/maintenance", "permanent": false }
]
```

Note: the parent `12_mddb_web/vercel.json` currently contains that redirect. Check which folder Vercel uses as the project root before switching to v2.

## Other hosts

Any static host can serve `_site/` after `npm run build`, but two things are Vercel-specific:
- The editor's login uses the functions in `api/`.
- Clean URLs come from `vercel.json`.

GitHub Pages, for example, would need a GitHub Action to run the build and a separate login service for the editor.

**GitHub Pages is not used.** The site is served by Vercel. If Pages is switched on for this repository (Settings → Pages), its "pages build and deployment" check fails on the templates with *"Liquid syntax error: Unknown tag 'extends'"*. Turn Pages off there; it doesn't affect the live site.

## Checklist before going live

- [ ] `npm run build` runs without errors, and every page renders when served over `http://` (logo, video, globe).
- [ ] Canonical/OG URLs point at `https://mddba.com/...` (from `siteUrl` in `src/_data/settings.json`).
- [ ] The GitHub OAuth App callback URL and `backend.branch` in `src/admin/config.yml` match the live site.
- [ ] Remove the maintenance redirect if one is active.
