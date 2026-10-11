# MDDB America Website — v2

The redesigned website for **MDDB America** (Molecular Dynamics Data Bank America), served at [mddba.com](https://mddba.com).

v2 keeps the original colour theme (navy `#0a1628`, primary blue `#1a8cff`, light `#f0f6ff`) and all of the v1 content, presented in an editorial, scroll-driven layout inspired by [prosion.eu](https://www.prosion.eu):

- large light-weight display type (Geist), eyebrow labels and gradient-highlighted statements
- a dark hero with the molecule video; the light About section slides over it as you scroll
- a full-screen "Menu" overlay on every screen size, with a site search (press `/` or Ctrl/⌘ K anywhere to jump to it)
- two pinned scroll scenes on the home page: the FAIR principles (one MD dataset, a particle protein, is followed through Findable, Accessible, Interoperable and Reusable) and the MDDB nodes (an interactive globe rotates to each node)
- a top-down free-energy landscape (contour map) behind the "Get involved" bands, with a particle running Langevin dynamics across its basins
- round "text buttons", soft blue glows and a navy/light rhythm between sections

It is still a plain static site — **no build step**. Edit the HTML/CSS/JS directly.

## Run locally

```bash
cd mddb-web_v2
python3 -m http.server 8000
# open http://localhost:8000
```

Use a local server rather than opening the files directly: the logo is drawn with a CSS mask, which browsers do not load from `file://`.

## Project structure

```
mddb-web_v2/
├── index.html                  Home page
├── pages/                      Partners, News, Events, Publications, Community + news articles
├── 404.html                    Not-found page (root-absolute paths; served at any depth)
├── maintenance.html            Standalone maintenance page
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
│   │   ├── landscape.js        Energy-landscape surface + the animated walker (pages with a "Get involved" band)
│   │   └── data.js             Counter values and node/institution coordinates for the globe
│   ├── data/fair-protein.json  The FAIR viewer's molecule (adenylate kinase, open + closed)
│   ├── images/                 Optimised images (EXIF/GPS stripped), logo mask, OG image, energy-landscape.svg
│   └── videos/                 hero.webm / hero.mp4 (≈2.6 MB) + poster
├── tools/build-landscape.js    Regenerates energy-landscape.svg from landscape.js (node, no dependencies)
├── tools/build-fair-protein.js Regenerates assets/data/fair-protein.json from the PDB (node 18+, no dependencies)
├── sitemap.xml, robots.txt, site.webmanifest, vercel.json
└── docs/deployment.md
```

External libraries (pinned versions with SRI hashes, loaded on the home page only): GSAP 3.15 + ScrollTrigger (cdnjs), d3-array, d3-geo, topojson-client and the world-atlas land outlines (jsDelivr). The Geist and Geist Mono fonts come from Google Fonts.

## Updating content

Every page carries the same nav, menu dialog and footer markup. If you change a menu or footer link, change it on **every** HTML file (search for `class="menu__list"` / `class="footer__grid"`).

### Add a news article
1. Copy an existing `pages/news-*.html` file and rename it, e.g. `pages/news-my-story.html`.
2. Update `<title>`, the `description`, `canonical`, `og:*`/`twitter:*` tags and `article:published_time` in the `<head>`.
3. Update the header (chips, `<h1>`, `<time>`), the featured image, the `.prose` body, and the share links (they must contain the new page URL).
4. Put the image in `assets/images/news/`. Keep it ≤1600 px wide and strip location metadata from phone photos.
5. Add a card for it to `pages/news.html` (set `data-tags` to the lowercase tags; add a filter button if it's a new tag), to the home page "Recent from MDDB America" grid (keep the latest three), and to the "More News" section of the other articles.
6. Add the URL to `sitemap.xml`.

### Add an event
In `pages/events.html` copy the `<li class="row">` block. For an upcoming event, put it in the "Upcoming" block and remove the `.empty-state` box. Then add the event to `events` in `assets/js/data.js` so the home page counter updates.

### Add a publication
Copy the `<li class="row pub-row">` block in `pages/publications.html`, then add the title to `publications` in `assets/js/data.js`.

### Add a partner
Copy the University of Florida `<li>` in `pages/partners.html` (logo in `assets/images/partners/`), optionally add the logo to the "Partnering with…" strip on the home page, then add the name to `partners` in `assets/js/data.js`.

### Nodes and the globe
The node list is in `index.html` (`.node-list`). The globe reads `nodes` and `sites` (other institutions) from `assets/js/data.js`; keep the order of `nodes` the same as the list.

### Funder logo
The footer has a commented-out `.funder` block. Add the logo to `assets/images/funder/`, fill in the text and uncomment it on every page.

## Behaviour notes

- **Scroll scenes** (FAIR, Nodes) use `position: sticky` inside tall wrappers; ScrollTrigger only reports progress. They switch on with `html.js-scenes`, which is added only on screens ≥768 px wide that are not tall portrait and have no reduced-motion preference. Everywhere else, and without JavaScript, the content is a normal stacked layout.
- **Never put `overflow` on `html`, `body`, `main` or a `.scene` wrapper.** It breaks `position: sticky`. Glows sit in `.orb-layer`, which clips itself.
- **Nav colour** flips between light and dark automatically from the `data-theme="dark|light"` attribute on each section.
- **Reduced motion**: no pinning, scrubbing or video (the poster is shown instead), and counters jump straight to their values.
- **Email links**: any element with `data-email` gets `mailto:info@mddba.com` at runtime.
- **Site search** (menu): there is no index file to maintain. The first time someone uses the search, `site.js` fetches the pages linked from the menu, plus the pages those link to (so new news articles are found automatically once they are linked from `news.html`), and indexes their `<main>` content. Home is split into its sections (`#about`, `#goals`, `#nodes`, `#contact`). News cards, buttons and decorative elements are skipped. The search needs `http(s)://`; over `file://` it only lists the menu pages.
- **FAIR viewer** (home page): `assets/js/fair3d.js` draws one MD dataset with particles, in the hero video's style but in deep blues straight on the light section (no panel; the canvas fades out at its edges). The molecule is E. coli adenylate kinase in its open (PDB 4AKE) and closed (PDB 1AKE) forms, from `assets/data/fair-protein.json`. It is shown as its molecular surface: a smooth Gaussian surface meshed by the build tool, with baked ambient occlusion, coloured by domain (NMP indigo, CORE blue, LID cyan). The surface closes and opens with the protein. As you scroll, the same particles move through four states:
  - **F:** the protein assembles out of a drift of other datasets and is tagged with its ID card.
  - **A:** its trajectory plays (open ⇄ closed), and frames stream to an API request.
  - **I:** the surface turns see-through and the cartoon ribbon forms inside it, while file formats stream in.
  - **R:** the site's own free-energy landscape is raised into 3D contour lines, with the site's walker running on it; the small protein above opens or closes with the walker's basin.

  The HUD text (ID, metadata, API path, formats, axis labels) is plain HTML in `index.html`; it is illustrative, so edit it there. In the stacked layout (phones, reduced motion), each principle gets its own small panel, which is a still frame with reduced motion. Without WebGL, the same picture is drawn with the 2D canvas, with the surface as lit dots. To use another protein, edit the PDB IDs in `tools/build-fair-protein.js` and run it.
- **Cache-busting:** the home page loads its CSS and JS with a version tag (`…?v=20261011.3`). After changing any of them, raise that value in `index.html` so browsers fetch the new files. When previewing with `python3 -m http.server`, a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) also works.
- **Energy landscape** ("Get involved" bands on Home, Partners and Community): the contour lines are the static `assets/images/energy-landscape.svg`; `landscape.js` animates a particle on the same surface (paused off-screen; a still trajectory with reduced motion). To change the shape, edit the wells in `assets/js/landscape.js` and run `node tools/build-landscape.js`.

## Deployment

See [docs/deployment.md](docs/deployment.md).

## License

MIT — see [LICENSE](LICENSE).

The FAIR viewer's molecule uses PDB entries 4AKE (Müller et al., 1996) and 1AKE (Müller & Schulz, 1992) from the RCSB Protein Data Bank, which are in the public domain (CC0).
