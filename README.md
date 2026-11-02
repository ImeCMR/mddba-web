# MDDB America Website — v2

The redesigned website for **MDDB America** (Molecular Dynamics Data Bank America), served at [mddba.com](https://mddba.com).

v2 keeps the original colour theme (navy `#0a1628`, primary blue `#1a8cff`, light `#f0f6ff`) and all of the v1 content, presented in an editorial, scroll-driven layout inspired by [prosion.eu](https://www.prosion.eu):

- large light-weight display type (Geist), eyebrow labels and gradient-highlighted statements
- a dark hero with the molecule video; the light About section slides over it as you scroll
- a full-screen "Menu" overlay on every screen size, with a site search (press `/` or Ctrl/⌘ K anywhere to jump to it)
- two pinned scroll scenes on the home page: the FAIR principles (one MD dataset, a particle protein, is followed through Findable, Accessible, Interoperable and Reusable) and the MDDB main nodes (Europe, America and Japan, each grouping several nodes; an interactive globe rotates to each one)
- a top-down free-energy landscape (contour map) behind the "Get involved" bands, with a particle running Langevin dynamics across its basins
- round "text buttons", soft blue glows and a navy/light rhythm between sections

The pages are built with [Eleventy](https://www.11ty.dev) from templates (`src/`) and content files (`src/_data/*.json`, `src/news/*.md`). The content is edited in a WordPress-style editor at **`/admin`** ([Decap CMS](https://decapcms.org)): saving there commits to GitHub and Vercel rebuilds the site in about a minute. The output is plain static HTML/CSS/JS, the same as before the editor was added.

- **Editors:** see [docs/editing-guide.md](docs/editing-guide.md).
- **Set-up (GitHub login, Vercel):** see [docs/deployment.md](docs/deployment.md).

## Run locally

```bash
cd mddb-web_v2
npm install
npm start          # builds into _site/ and serves http://localhost:8080 (rebuilds on save)
```

To try the editor on your own computer without logging in, also run `npm run cms` in a second terminal and open http://localhost:8080/admin/. It edits the files in your working copy (nothing is committed).

`npm run build` builds once into `_site/` (what Vercel publishes). Don't edit `_site/`: it is rebuilt each time.

## Project structure

```
mddb-web_v2/
├── src/                        Everything Eleventy builds into _site/
│   ├── _data/                  The content (edited in the editor): settings, home, nodes, events,
│   │                           publications, partners, community, news (News page text) + derived.js
│   │                           (counters, data.js), eleventyComputed.js (page titles), build.js
│   ├── news/*.md               News posts (front matter + Markdown); news.11tydata.js sets their layout and URL
│   ├── _includes/layouts/      base.njk (head, nav, menu + search, footer: shared by every page), article.njk
│   ├── _includes/partials/     news-card, event-row, page-hero, text-btn, social
│   ├── index.njk               Home page (the FAIR viewer and its HUD text are here)
│   ├── pages/*.njk             Partners, News, Events, Publications, Community
│   ├── 404.njk                 Not-found page (root-absolute paths; served at any depth)
│   ├── data-js.njk, sitemap.njk  → assets/js/data.js and sitemap.xml
│   └── admin/                  The editor: config.yml (what can be edited), index.njk, preview.js
├── api/auth.js, api/callback.js  GitHub login for the editor (Vercel functions)
├── eleventy.config.js          Build settings, filters (**highlight**, dates, links…), copied files
├── maintenance.html            Standalone maintenance page (copied as is)
├── assets/
│   ├── css/
│   │   ├── tokens.css          Colours, type scale, spacing — start here to restyle
│   │   ├── main.css            Shared: base, nav, menu, buttons, cards, CTA band, footer, page header
│   │   ├── home.css            Home page: hero, about, stats, FAIR + nodes scroll scenes
│   │   └── pages.css           Sub pages: partners, news filter, events, publications, community, articles
│   ├── js/
│   │   ├── site.js             All pages: nav state, menu dialog + site search, email links, reveal on scroll, news filter
│   │   ├── home.js             Home only: hero video, counters, scroll scenes, globe wiring
│   │   ├── fair3d.js           FAIR viewer: the particle protein and its four states (WebGL, 2D-canvas fallback, no library)
│   │   ├── globe.js            Canvas globe (d3-geo) for the nodes section
│   │   └── landscape.js        Energy-landscape surface + the animated walker (pages with a "Get involved" band)
│   ├── data/fair-protein.json  The FAIR viewer's molecule (adenylate kinase, open + closed)
│   ├── images/                 Optimised images (EXIF/GPS stripped), logo mask, OG image, energy-landscape.svg
│   └── videos/                 hero.mp4 / hero.webm (≈2.6 MB) + poster
├── tools/build-landscape.js    Regenerates energy-landscape.svg from landscape.js (node, no dependencies)
├── tools/build-fair-protein.js Regenerates assets/data/fair-protein.json from the PDB (node 18+, no dependencies)
├── tools/compare-build.js      Compares _site/ with another copy of the site, page by page
├── tools/check-cms-config.js   Checks the editor's config.yml lists every field of the content files
├── robots.txt, site.webmanifest, favicons, vercel.json, package.json
└── docs/                       editing-guide.md (for editors), deployment.md
```

External libraries (pinned versions with SRI hashes, loaded on the home page only): GSAP 3.15 + ScrollTrigger (cdnjs), d3-array, d3-geo, topojson-client and the world-atlas land outlines (jsDelivr). The Geist and Geist Mono fonts come from Google Fonts.

## Updating content

Use the editor at `/admin` for content: news posts, events, publications, partners, nodes, page text and site settings ([docs/editing-guide.md](docs/editing-guide.md)). It writes the files below, which you can also edit by hand:

| What | File | Shown on |
|---|---|---|
| News posts | `src/news/<name>.md` (URL: `/pages/news-<name>`) | its own page; cards on Home (newest 3), News (all) and "More News" (2 newest others); sitemap |
| Events | `src/_data/events.json` | Events page ("Upcoming" from the build date on, "Past" before it); home counter (events not hidden) |
| Publications | `src/_data/publications.json` | Publications page; home counter |
| Partners | `src/_data/partners.json` | Partners page; logos with `onHome` in the home "Partnering with…" strip |
| Nodes | `src/_data/nodes.json` | home node list and globe (`assets/js/data.js`); "MDDB Nodes" and "Partner Institutions" counters |
| Page text | `src/_data/home.json`, `news.json`, `community.json` (and the page text in the files above) | those pages |
| Settings | `src/_data/settings.json` | contact email, social links, footer text, search suggestions, sharing picture, asset version |

- **Highlighted words:** in titles and statements, `**words**` are shown in the blue gradient; in button texts they are bold. In a label, `" | "` shows a separator.
- **Nodes and counters:** each node in `sites` is joined on the globe by a dotted line to the main node with the same `region`. The counters count the `sites` of each region; a main node with none listed, like Japan, counts as 1 (9 now: Europe 7, America 1, Japan 1). Each node counts as one partner institution.
- **Upcoming events** move to "Past" at the next build after their date (any save in the editor rebuilds the site).
- **Layout and design** (templates, CSS, JS) are not in the editor: edit `src/` and `assets/`. The nav, menu and footer are in `src/_includes/layouts/base.njk`, once for every page.
- **New editable fields:** add the key to the JSON file, use it in the template, and add the field to `src/admin/config.yml` (the editor deletes keys it doesn't know when it saves). `node tools/check-cms-config.js` checks this.
- **Funder logo:** the footer in `base.njk` has a commented-out `.funder` block. Add the logo to `assets/images/funder/`, fill in the text and uncomment it.

## Behaviour notes

- **Scroll scenes** (FAIR, Nodes) use `position: sticky` inside tall wrappers; ScrollTrigger only reports progress. They switch on with `html.js-scenes`, which is added on every screen size unless the visitor prefers reduced motion. Wide screens get the side-by-side layout; phones and portrait tablets (`max-width: 767px` or `max-aspect-ratio: 4/5`) get the same scenes in one column, with the 3D on top and the active step below. With reduced motion, and without JavaScript, the content is a normal stacked layout. Because a pinned scene centres its content, `home.js` pulls the FAIR scene up under its intro and the nodes section up over the FAIR scene's empty bottom band, so the gaps around the FAIR animation stay short.
- **Never put `overflow` on `html`, `body`, `main` or a `.scene` wrapper.** It breaks `position: sticky`. Glows sit in `.orb-layer`, which clips itself.
- **Nav colour** flips between light and dark automatically from the `data-theme="dark|light"` attribute on each section.
- **Reduced motion**: no pinning, scrubbing or video (the poster is shown instead), and counters jump straight to their values.
- **Hero video**: the MP4 (H.264) is listed first because iPhones play it reliably, while their WebM support is patchy. If the browser refuses autoplay (iPhone Low Power Mode, in-app browsers such as LinkedIn or WhatsApp), the video starts on the visitor's first tap; it also resumes when the tab is shown again.
- **Email links**: any element with `data-email` gets a `mailto:` link at runtime. The address is assembled in `site.js` (to keep it away from scrapers); the build writes the one from Settings into it.
- **Site search** (menu): there is no index file to maintain. The first time someone uses the search, `site.js` fetches the pages linked from the menu, plus the pages those link to (so new news articles are found automatically once they are linked from `news.html`), and indexes their `<main>` content. Home is split into its sections (`#about`, `#goals`, `#nodes`, `#contact`). News cards, buttons and decorative elements are skipped. The search needs `http(s)://`; over `file://` it only lists the menu pages.
- **FAIR viewer** (home page): `assets/js/fair3d.js` draws one MD dataset with particles, in the hero video's style but in deep blues straight on the light section (no panel; the canvas fades out at its edges). The molecule is E. coli adenylate kinase in its open (PDB 4AKE) and closed (PDB 1AKE) forms, from `assets/data/fair-protein.json`. It is shown as its molecular surface: a smooth Gaussian surface meshed by the build tool, with baked ambient occlusion, coloured by domain (NMP indigo, CORE blue, LID cyan). The surface closes and opens with the protein. As you scroll, the same particles move through four states:
  - **F:** the protein assembles out of a drift of other datasets and is tagged with its ID card.
  - **A:** its trajectory plays (open ⇄ closed), and frames stream to an API request.
  - **I:** the surface turns see-through and the cartoon ribbon forms inside it, while file formats stream in.
  - **R:** the site's own free-energy landscape is raised into 3D contour lines, with the site's walker running on it; the small protein above opens or closes with the walker's basin.

  The HUD text (ID, metadata, API path, formats, axis labels) is plain HTML in `src/index.njk`; it is illustrative, so edit it there. Phones get the same viewer with fewer particles. In the stacked layout (reduced motion), each principle gets its own small panel showing a still frame. Without WebGL, the same picture is drawn with the 2D canvas, with the surface as lit dots. To use another protein, edit the PDB IDs in `tools/build-fair-protein.js` and run it.
- **Cache-busting:** the home page loads its CSS and JS with a version tag (`…?v=20261011.11`). After changing any of them, raise `assetVersion` in `src/_data/settings.json` so browsers fetch the new files. `data.js` gets its own tag from its content, so content edits need nothing.
- **Checking a change:** `node tools/compare-build.js <folder>` compares `_site/` with another copy of the site page by page (elements, attributes and text), and lists what differs.
- **Energy landscape** ("Get involved" bands on Home, Partners and Community): the contour lines are the static `assets/images/energy-landscape.svg`; `landscape.js` animates a particle on the same surface (paused off-screen; a still trajectory with reduced motion). On phones the map sits below the buttons, framed on the basins the particle explores. To change the shape, edit the wells in `assets/js/landscape.js` and run `node tools/build-landscape.js`.

## Deployment

See [docs/deployment.md](docs/deployment.md).

## License

MIT — see [LICENSE](LICENSE).

The FAIR viewer's molecule uses PDB entries 4AKE (Müller et al., 1996) and 1AKE (Müller & Schulz, 1992) from the RCSB Protein Data Bank, which are in the public domain (CC0).
