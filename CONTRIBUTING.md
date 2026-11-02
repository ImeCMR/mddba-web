# Contributing to MDDB America Website

Thank you for contributing to the MDDB America website. This project is a static website built with Eleventy; content is edited in the Decap CMS editor at `/admin` (see `docs/editing-guide.md`). We value clear changes, clean commits, and reliable deployment.

## How to Contribute

1. Fork the repository.
2. Create a new branch for your work:
```bash
git checkout -b feature/your-feature-name
```
3. Make your changes.
4. Test locally: `npm install`, then `npm start` (builds into `_site/` and serves http://localhost:8080). Opening the files directly (`file://`) will not load the logo mask.
5. Commit with a clear message.
6. Open a pull request describing your changes.

## Pull Request Guidelines

- Keep changes focused and scoped.
- Update relative paths if you move or rename files.
- Verify page links, assets, and navigation before submitting.
- Include screenshots or a summary of testing if the change affects layout or behavior.

## Code Style

- HTML should use semantic structure and valid nesting.
- CSS should be organized in `assets/css/` and use the design tokens in `tokens.css` where possible.
- Never add `overflow` to `html`, `body`, `main` or a `.scene` wrapper — it breaks the sticky scroll scenes on the home page.
- The nav, menu and footer are in `src/_includes/layouts/base.njk`, shared by every page.
- Content belongs in `src/_data/*.json` or `src/news/*.md`, not in the templates. A new content field also needs an entry in `src/admin/config.yml` (`node tools/check-cms-config.js` checks this).
- JavaScript should be placed in `assets/js/` and keep page-specific logic separated.

## File Organization

- `src/index.njk` — Home page template
- `src/pages/` — Additional page templates; `src/news/` — news posts
- `src/_data/` — Content (edited in the editor at `/admin`)
- `src/_includes/` — Shared layout and partials
- `src/admin/` — Editor configuration
- `api/` — Editor login (Vercel functions)
- `assets/css/` — Styles
- `assets/js/` — JavaScript logic
- `assets/images/` — Image assets
- `assets/videos/` — Video assets

## Reporting Issues

If you find a bug or have an improvement suggestion, please open an issue in the repository.
