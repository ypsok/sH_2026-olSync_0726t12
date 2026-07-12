# SmartHub Online Sync Viewer

Static GitHub Pages viewer for encrypted SmartHub records.

The repository intentionally stores SmartHub data only as an encrypted payload in `data/smarthub.enc.json`.
Do not commit local passphrases, raw exports, customer files, payment images, or plaintext JSON records.

## Local Export

```powershell
node tools/export-smarthub-data.mjs
```

The exporter reads the configured SmartHub resource root and `%LocalAppData%\SmartHub`, then rewrites the encrypted payload.

## GitHub Pages

Expected URL:

```text
https://ypsok.github.io/sH_2026-olSync_0726t12/index.html
```
