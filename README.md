# LocDat

Site contamination field data collection PWA.

## Running locally

**LocDat cannot be opened by double-clicking index.html.** Chrome blocks IndexedDB (the local data store) when HTML files are loaded directly from disk. Use a local web server instead.

### Quickest option

- **Windows:** double-click `start-windows.bat`
- **Mac / Linux:** `./start-unix.sh`

Both require Python 3. They start a local server on port 8765 and open your default browser at `http://localhost:8765`.

### Manual option

```bash
cd locdat
python3 -m http.server 8000
```

Then open `http://localhost:8000` in Chrome.

## Deploying to Android phone

1. Upload the entire `locdat` folder to a static web host — **GitHub Pages** (free), **Netlify Drop**, or **Cloudflare Pages**.
2. On your phone, open the hosted URL in Chrome.
3. Tap the ⋮ menu → **Add to home screen**. LocDat installs as a standalone app icon.
4. Launch from the home screen. GPS, camera and local storage all work.

## Data

All data lives in the browser's IndexedDB. It persists across app restarts, survives browser close, but is tied to the specific browser/device.

Use **Export Data** on the home screen to download:
- A single **Excel workbook (.xlsx)** with one sheet per data category — Project, Locations, Soil Boreholes, Soil Lithology, Samples, Field Measurements, GW Well Gauges, GW Well Construction, Custom. Column headings are ESDAT-aligned where applicable.
- A single **photos zip (.zip)** containing every selected photo. Filenames embed the date/time and source (location, sample, borehole) for traceability.

## Internet requirements

- **First load of the app** requires internet (to fetch Leaflet, proj4 from CDN). After that, the service worker caches them.
- **The satellite map tiles always require internet** — they are loaded fresh from Esri World Imagery each time you view a location.
