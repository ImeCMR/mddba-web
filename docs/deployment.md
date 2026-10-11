# Deployment

The site is static: deploy the contents of `mddb-web_v2/` as the web root. No build command is needed.

## Vercel (current host)

`vercel.json`:

```json
{ "cleanUrls": true, "trailingSlash": false }
```

- `cleanUrls` serves `/pages/news.html` at `/pages/news`. The relative `.html` links in the pages still work locally and redirect (308) to the clean URL on Vercel.
- `404.html` at the project root is used automatically for unknown URLs. It uses root-absolute paths (`/assets/...`) so it renders at any depth.
- Project settings: Framework preset **Other**, no build command, output directory = the folder root.

### Maintenance mode
`maintenance.html` is standalone (no nav or JS). To send all traffic to it, add a redirect like the one in the parent `12_mddb_web/vercel.json`:

```json
"redirects": [
  { "source": "/((?!maintenance|assets).*)", "destination": "/maintenance", "permanent": false }
]
```

Note: the parent `12_mddb_web/vercel.json` currently contains that redirect. Check which folder Vercel uses as the project root before switching to v2.

## GitHub Pages

This also works as-is, with these differences:

- No clean URLs. Links include `.html`, which GitHub Pages serves directly.
- `404.html` is picked up automatically.
- For the custom domain, add a `CNAME` file containing `mddba.com` and point DNS at GitHub Pages (A records `185.199.108–111.153`, or a CNAME to `<user>.github.io`).

## Checklist before going live

- [ ] Open every page over `http://` (not `file://`) and check the logo, video and globe render.
- [ ] Canonical/OG URLs in `<head>` point at `https://mddba.com/...` (already set for all pages).
- [ ] `sitemap.xml` lists every page.
- [ ] Remove the maintenance redirect if one is active.
