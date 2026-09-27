# Omni AR Twin — hands-free digital wellness

A React + Node.js app that opens your camera and gives you a personal **AR twin**. The twin mirrors your hands as a digital clone, coaches gesture-based brain exercises, answers voice commands, acts as a digital fill light for your face, and handles the routine steps of healthy habits so you only do the part that needs you.

The motto is **digital detox**. The twin does roughly 70–80% of each habit (timers, reminders, lighting, coaching, logging). You do the other 20–30%: drink the water, look away from the screen, stretch.

Under the hood, the **Omni O(1) engine** (a JavaScript port of [omnidimensionaldialingverse](https://github.com/andrometocsglobal/omnidimensionaldialingverse)) computes arithmetic, geometric and harmonic power sums with one midpoint moment-block expansion. The cost depends only on the power, never on the number of terms.

## Features

| Area | What it does |
| --- | --- |
| **Camera AR** | The camera opens on load. The canvas overlay draws your hand skeleton, a delayed mirror "digital clone" of your hands, and the twin avatar walking between task stations with a speech bubble. |
| **Real AR (Android)** | `Enter real AR` starts a WebXR `immersive-ar` session with surface hit-testing (ARCore + Chrome). Tap a surface to place your twin in the room, and tap again to drop task stations. The twin walks to the station of the task it's working on. |
| **Signed AR registration** | `server/ar/ar-register.json` is an ECDSA P-256 signed manifest of the AR element: integrity hash, capabilities and validity window. The browser verifies it with WebCrypto before any AR feature is enabled, and the server verifies it again before issuing a registration receipt. Tampering disables the twin. |
| **Omni ID** | One person, one AR twin, one signature: a per-person key pair and a signed passport, registered with the server, plus challenge-response proof of ownership. An AES-GCM/PBKDF2 encrypted backup lets you create it once and use it on any device. |
| **Gestures** | 11 rotation-invariant gestures from MediaPipe hand landmarks. Each gesture gives a wellness tip, 👍 confirms your part of a task, and fingers answer exercises (0–10 across two hands). |
| **Brain exercises** | *Finger Math* (hold up the answer), *Mirror Memory* (repeat a growing gesture sequence) and *Gesture Breathing* (open palm to inhale, fist to exhale). Streak points use the exact AP sum, levels grow geometrically, and focus speed is the harmonic mean of your reaction times. |
| **Voice** | Web Speech recognition (Chrome, Edge, Android), with a typed command box that uses the same parser everywhere. Say `help` for the list. |
| **Digital bulb** | A software fill light: brightness, contrast and tone grading on the video, a spotlight that follows your detected face, a ring-light mode that turns the whole screen into a light source, and the hardware torch where the camera supports one. Warm, neutral and cool tones. |
| **Habit automation** | Six habit tasks (hydration, 20-20-20 screen break, posture, calm, detox block, stretch), each split into twin steps and human steps. An automatic screen break triggers after N minutes of screen time. A live meter shows the split between you and the twin. |
| **Preferences** | Twin name, colour, shape (orb, bot, spark), motto, voice speed and language, gesture steadiness, break interval, detox goal, task speed and reduced motion. |
| **Omni Lab** | Exact AP, GP and HP sums and D-dimensional lattice sums, computed in the browser or on the server. Shows the chosen algorithm, time and space cost, and a brute-force comparison. Includes a built-in verification suite. |

## Run it

```bash
npm install
npm run build        # React client -> dist/
npm start            # Express on http://127.0.0.1:8787 (API + client)
```

Development with hot reload (API on :8787, Vite on :5173):

```bash
npm run dev
```

The camera needs a secure context: `localhost` works. For phones and real AR, serve over **https** (any TLS reverse proxy in front of `npm start`, with `HOST=0.0.0.0`), or use `chrome://inspect` port forwarding to reach `localhost` from the phone.

## Deploy

Both hosts give you HTTPS, which the camera, voice and real AR require on phones.

### Render (full Node server)

`render.yaml` is a Render Blueprint. In Render, choose **New → Blueprint** and pick this repo. It builds with `npm ci && npm run build`, runs `npm start`, and health-checks `/api/health`. It binds `0.0.0.0` on Render's `PORT`, trusts one proxy hop so rate limits see real client IPs, and generates `OMNI_SECRET` for you.

On the free plan the disk is ephemeral, so the identity registry file resets on redeploy. Proving Omni ID ownership still works after a reset because passports are self-certifying. To keep the registry, attach a persistent disk and point `OMNI_DATA_DIR` at it.

### Netlify (CDN + serverless function)

`netlify.toml` builds with `npm run build:netlify`, which is the Vite build plus the MediaPipe WASM copied into `dist/`. It publishes `dist/` to the CDN and runs the same Express API as a Netlify Function (`netlify/functions/api.mjs`, via `serverless-http`). `/api/*` is rewritten to the function, `/models/*` is proxied to Google's model storage (so the page stays same-origin), and the CSP matches the server's exactly (a unit test enforces this).

Set **`OMNI_SECRET`** (any long random string) under Site settings → Environment variables. Omni ID challenges are HMAC-signed and stateless, so any function instance can verify them.

Other hosts: any Node 22 host can run `npm run build && npm start` with `HOST=0.0.0.0`.

`/?mock=1` replaces MediaPipe with a scriptable tracker (`window.__omni.pose('peace')`, `.fingers(3)`, `.clear()`), for demos without a camera.

## Tests

```bash
npm test             # 51 unit, API and deploy tests (node:test)
npm run test:e2e     # 13 Playwright tests: production build, real Chrome, fake camera
npm run test:all
```

The E2E tests use installed Google Chrome by default. Set `PW_CHANNEL=` to use Playwright's bundled Chromium instead (`npx playwright install chromium`).

What the tests check:

- Every AP, GP and HP value in the *Omni AP·GP·HP* deck (powers 1–10), exactly.
- An exhaustive closed-form vs brute-force suite with 0 failures. The worst HP relative error is ~7e-16.
- AR registration tampering: element, signature, schema, key and expiry.
- Omni ID sign, verify, challenge and backup round-trip, including a forged key and a wrong passphrase.
- The gesture classifier across rotations and scales, the voice grammar, the exercise and task state machines, and preference sanitising.
- Deploy targets: the Netlify function handler, Omni ID challenges proven on a different instance from the one that issued them, the `netlify.toml` CSP and model proxies, and `render.yaml`.
- In the browser: camera on load, gestures giving tips, Finger Math and breathing, bulb, ring light and torch fallback, the Omni maths commands, automated tasks confirmed by thumbs-up and voice, Omni ID create, export, wipe and restore, the Omni Lab, and a tampered registry disabling AR.

## Re-signing the AR element

Edit `server/ar/ar-element.json`, then run:

```bash
npm run sign:ar      # add -- --days 180 to change validity
```

The first run creates `.keys/ar-signing-key.json` (git-ignored, **keep it private**) and rewrites `shared/security/trustedKeys.js` with the public key. Commit the new `ar-register.json` and `trustedKeys.js`.

## Project layout

```
shared/            pure JS, used by browser and server
  omni/            Fraction (BigInt), midpoint engine, chooser, verifier
  security/        AR registration signing + verification
  identity/        Omni ID passports, challenges, encrypted backups
  hands/           gesture classifier, synthetic hands
  voice/           command parser
  wellness/        tips, brain-exercise state machines
  automation/      habit task templates + runner
  prefs.js
server/            Express API, AR registry, model proxy
client/            React app (Vite)
  src/ar/          canvas AR layer, WebXR scene (three.js)
  src/hooks/       camera, tracking, voice, registration, identity
  src/components/  panels
tests/unit, tests/e2e
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ar/registry` | Signed AR element registration |
| POST | `/api/ar/register` | Verify and register this device; returns a receipt |
| POST | `/api/identity/register` | Register or update an Omni ID passport |
| POST | `/api/identity/challenge` · `/api/identity/verify` | Prove ownership of an Omni ID |
| GET | `/api/omni/ap?F&L&p` · `/gp?a&r&n&s` · `/hp?F&L&s` | Omni sums |
| POST | `/api/omni/lattice` | `{ dims: [{F, L, p}] }` |
| GET | `/api/omni/verify` | Run the verification suite |
| GET | `/models/:name` | MediaPipe models, fetched once from Google and cached |

## Honest limits

- The quantities in the Omni engine are classical (Faulhaber, Euler–Maclaurin, Hurwitz ζ). What's new here is the single engine that unifies them, the shared μ-library and the verified constant-time packaging. HP sums have no finite closed form. The fast HP path is double precision, with ~1e-15 relative error. Exact HP uses rationals and only runs on small ranges.
- The twin automates only what happens inside the app: timers, reminders, lighting, coaching and logging. It can't act elsewhere on your device. AI assistance is a natural next step.
- Real AR needs an ARCore-capable Android phone with Chrome, over https. Other devices get the camera-overlay twin.
- Wellness tips are general guidance, not medical advice.
- All camera, hand and face processing stays in the browser.
