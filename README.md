# getbpmfinder.com

BPM Finder — free online BPM (tempo) and song key detector. Main keyword: `bpm finder`.

**All processing runs in the visitor's browser** — audio files are decoded with the Web Audio API and analyzed in a local Web Worker. Nothing is uploaded, no account required.

## Files

- `index.html` — the entire site (single page). Markup, styles reference, and the inline Web Worker (Blob URL).
- `style.css` — styles. Design tokens in `:root`.
- `robots.txt` / `sitemap.xml` — for https://getbpmfinder.com

## Deploy

Static hosting, no build step. Point your host (Cloudflare Pages / GitHub Pages / any static server) at this directory:

- Build command: *(none)*
- Output directory: `/` (repo root)
- Custom domain: getbpmfinder.com

## Algorithm notes

- BPM: 11025 Hz mono downsample → RMS envelope (frame 1024 / hop 256) → half-wave rectified diff (onset) → autocorrelation in the 50–220 BPM lag range → parabolic peak interpolation → octave disambiguation preferring 70–180 BPM, half/double alternatives offered.
- Key: FFT (frame 4096 / hop 2048) → 12-bin chroma (A4=440) → Pearson correlation against 24 Krumhansl-Schmuckler profiles → Camelot mapping.
- Limits: 30 MB / 12 minutes per file.
