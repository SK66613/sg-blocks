
# sg-blocks (minimal skeleton)

- `blocks/` — source blocks (each block has `block.json`, `view.html`, `style.css`, `runtime.js`).
- `scripts/build-manifest.mjs` — builds `dist/blocks/index.json` + copies block files.
- `templates.js` — tiny manifest-based loader (for Studio and Runtime).
- `worker_examples/blocks-proxy.js` — Cloudflare Worker to proxy `/blocks/*` to CF/GH mirrors.

## Build
```bash
npm i
npm run build
```
Artifacts: `dist/blocks/index.json` and `dist/blocks/<block>/*`

## Use in Studio / Runtime
Set base once:
```html
<script>window.__BLOCKS_BASE__='/blocks/';</script> <!-- or absolute CDN -->
<script src="/templates.js"></script>
<script>
  loadBlocksManifest().then(()=> loadBlock('calendar_booking'));
</script>
```

## Deploy mirrors
- Cloudflare Pages project `sg-blocks` → serve `dist/`.
- GitHub Pages repo `sg-blocks-public` → publish `dist/`.
Your Worker proxies `/blocks/*` to CF by default, GH for RU/BY/KZ.
