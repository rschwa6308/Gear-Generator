# Parametric Gear Generator

Design an involute spur gear in the browser, preview it in 3D, and export a print-ready STL. No build step, no server, no upload — everything (including the involute tooth-profile math) runs client-side.

**[Live demo](#)** — enable GitHub Pages (see below) to get a real link here.

## Stack

- Vanilla JS (ES modules), no bundler
- [three.js](https://threejs.org/) via CDN + import map, for rendering and STL export
- Hand-rolled involute gear math in [`js/gear-math.js`](js/gear-math.js) (no gear library dependency)

## Running locally

Any static file server works, e.g.:

```
npx serve .
```

(Opening `index.html` directly via `file://` will *not* work — ES module imports require `http://`.)

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo Settings → Pages → Source: **Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Your app will be live at `https://<username>.github.io/<repo>/` within a minute or two.

No GitHub Actions workflow is needed — there's nothing to build.

## Parameters

| Field | Meaning |
|---|---|
| Teeth (N) | Tooth count |
| Module | Tooth size in mm (`pitch diameter = module × teeth`) |
| Pressure Angle | Standard is 20° |
| Thickness | Gear height along its axis |
| Bore Ø | Center shaft hole (0 = none) |
| Backlash | Shaves material off both flanks so mating gears don't bind |
| Root Fillet | Rounds the tooth root for print strength |

Gear configurations are encoded in the URL query string, so any setup is a shareable link.
