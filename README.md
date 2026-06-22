# Centered Strategy

Marketing agency website — helping good people build great brands.

Centered Strategy builds personal brands and helps startups grow, with a specialty in
**functional health, sustainable living, and alternative medicine / natural healing**.
Services: website design & build, content creation & development, and growth strategy.

## Stack

A fast, dependency-free static site:

- `index.html` — page structure & content
- `styles.css` — design system (forest green / nature palette, Fraunces + Inter type)
- `main.js` — mobile nav, scroll reveal, footer year

No build step. Just open `index.html` in a browser to preview.

## Local preview

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy (GitHub Pages)

This repo is configured to serve from the `main` branch root. Pushing to `main`
publishes the site. The live URL appears under **Settings → Pages**.

## Customize

Look for these to make it yours:

- **Contact email** — search `hello@centeredstrategy.com` in `index.html`
- **Copy & headlines** — all editable directly in `index.html`
- **Colors / fonts** — CSS variables at the top of `styles.css`
- **Stats** — the "About" section numbers in `index.html`
