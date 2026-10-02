# Omni AR Twin — hands-free digital wellness

A **single static React app with no server and no backend API** that opens your camera and gives you a personal **3D AR twin**. It runs in any modern browser with a camera: laptop, desktop PC, iPhone or Android.

The twin **writes notes for you from your voice**: notepads, documents and sticky notes appear in the AR view as you speak, with no Send button. It also acts on hand gestures, mirrors your hands as a digital clone, works as a digital fill light for your face, and handles the routine steps of healthy habits so you only do the part that needs you.

The motto is **digital detox**. The twin does roughly 70–80% of each habit (timers, reminders, lighting, coaching, logging). You do the other 20–30%: drink the water, look away from the screen, stretch.

Everything happens on your device. Your data moves between devices only when you **export and import one JSON file**.

Under the hood, the **Omni O(1) engine** (a JavaScript port of [omnidimensionaldialingverse](https://github.com/andrometocsglobal/omnidimensionaldialingverse)) computes arithmetic, geometric and harmonic power sums with one midpoint moment-block expansion. The cost depends only on the power, never on the number of terms.

## Features

| Area | What it does |
| --- | --- |
| **AR verification on open** | When the camera opens, a verification screen checks the signed AR element step by step: schema, trusted key, SHA-256 integrity, ECDSA P-256 signature (WebCrypto, in your browser), validity window and local receipt. You then choose a sample AR element (Orb, Bot or Spark), its colour and name, and 3D or 2D mode, and start. |
| **3D Web AR, every device** | A three.js 3D twin drawn over the live camera. It stands on your open palm (scaling and tilting with your hand), floats beside your face (sized by how close you are), goes wherever you click or tap, and walks to its task stations. No ARCore needed. A 2D overlay mode is available for the lightest devices. |
| **Room-scale AR (ARCore)** | On ARCore Android phones with Chrome, WebXR `immersive-ar` with hit-testing places the twin on real floors and tables. Tap again to drop task stations. |
| **Signed AR registration** | `ar/ar-register.json` (ECDSA P-256, signed by `npm run sign:ar`) is built into the app. A newer signed registration can be imported as JSON; it replaces the built-in one only if it verifies. Tampered files are rejected and AR stays on the verified copy. |
| **Omni ID** | One person, one AR twin, one signature. A per-person key pair (kept in IndexedDB) and a self-certifying passport that anyone can verify offline. Proof of ownership happens on-device, and the local AR receipt is signed with your Omni ID. An encrypted (AES-GCM, PBKDF2) JSON backup lets you create it once and use it on any device. |
| **Voice notes in AR** | Say *"take a note"*, *"new document called Project plan"* or *"yellow sticky note call Mum at five"*. The twin walks over and writes on a paper card in the AR view as you speak. Sticky notes are pinned in the scene and can be dragged. Dictation understands *comma*, *period*, *question mark*, *new line*, *new paragraph*, *heading …*, *scratch that*, *read it back* and *stop dictation*. You can also say *open note …*, *list notes* and *export notes*. Everything is saved on the device and is editable in the **Notes** tab, with export as .txt, .md or JSON. |
| **Hands-free** | The microphone starts by itself when AR starts, so recognised speech acts immediately with no Send button. A live caption shows what was heard. |
| **Detached inputs → actions** | Voice, typed text and gestures are separate inputs into one action dispatcher. In the **Gestures** tab you can switch *voice → action* and *gesture → action* on or off independently, and choose what each gesture does. The defaults are ✌️ take a note, ✊ stop dictation and save, ☝️ new line, 👎 scratch that, 🤘 sticky note, 🤙 read it back, 📐 new document, 👍 done, 3 fingers bulb, 4 fingers tip. 🖐️ Open palm is kept free so the twin can stand on your hand. |
| **One-file JSON backup** | The **Data** tab exports everything to one JSON file: preferences, gesture map, notes, stats, task history, AR registration and receipt, and optionally your encrypted Omni ID. Import it on any other browser or device. |
| **Gestures** | 11 rotation-invariant gestures from MediaPipe hand landmarks, each held briefly and fired once (1.5 s cooldown). |
| **Digital bulb** | Video brightness and tone grading, a spotlight that follows your face, a ring-light mode that turns the whole screen into a light, and the hardware torch where the camera has one. |
| **Habit automation** | Six habit tasks, each split into twin steps and human steps, with a live meter of the split, plus an automatic screen break after N minutes. |
| **Omni Lab** | Exact AP, GP and HP sums and D-dimensional lattice sums, plus an exhaustive verification suite, all computed in the browser. |

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (hot reload)
npm run build        # static site -> dist/
npm run preview      # serve dist/ locally
```

The camera needs a secure context: `localhost` works. Phones need **https**, which Netlify and Render give you. `/?mock=1` swaps MediaPipe for a scriptable tracker (`window.__omni.pose('open_palm')`, `.fingers(3)`, `.clear()`) for demos without a camera.

## Deploy (static hosting, no server)

The build output `dist/` is plain static files: the app, the MediaPipe WASM runtime, and a CSP meta tag. Hand-tracking models load directly from Google's MediaPipe model storage, which the CSP allows.

- **Netlify:** connect the repo. `netlify.toml` runs `npm run build`, publishes `dist/`, and adds the SPA fallback and security headers. No functions and no environment variables are needed.
- **Render:** choose **New → Blueprint** and pick the repo. `render.yaml` defines a **static site** (`runtime: static`) with the same headers and SPA rewrite.
- **Anything else:** upload `dist/` to any static host with HTTPS.

A unit test keeps the CSP identical across the built page, `netlify.toml` and `render.yaml`.

## Tests

```bash
npm test             # 50 unit tests (node:test)
npm run test:e2e     # 19 Playwright tests on the static build, real Chrome, fake camera + scripted speech
npm run test:all
```

What the tests check:

- Every AP, GP and HP value in the *Omni AP·GP·HP* deck (powers 1–10), exactly.
- An exhaustive closed-form vs brute-force suite with 0 failures.
- AR registration tampering: element, signature, schema, key and expiry.
- Omni ID sign, verify, challenge and encrypted backup; local receipts signed by their holder.
- One-file backup: round-trip, junk rejection, tampered parts dropped with warnings, sanitised preferences and stats.
- Static-only guarantees: no server files, no `/api` calls from the client, and a matching CSP across all three configs.
- Voice notes: spoken punctuation, undo, headings, sticky notes, search, sanitising, backup round-trip; the note grammar keeps dictated words verbatim.
- The action layer: default gesture map, remapping, sanitising, cooldown, and switching voice and gestures off independently.
- In the browser: hands-free voice → AR notes through a scripted SpeechRecognition (auto-listen, dictation, *light on* written as text while dictating and run as a command afterwards, sticky notes, documents, persistence); gesture → actions for the whole note workflow; detached inputs and remapping; the verification gate and sample selection; 3D Web AR on desktop (palm anchor, click-to-place, 2D fallback); the bulb, ring light and torch fallback; the Omni maths commands; automated tasks; Omni ID create, prove, backup and restore; a whole-app backup exported in one browser profile and restored in another; tampered registration imports rejected; tampered stored registration ignored.

## Re-signing the AR element

Edit `ar/ar-element.json`, then run:

```bash
npm run sign:ar      # add -- --days 180 to change validity
```

The first run creates `.keys/ar-signing-key.json` (git-ignored, **keep it private**) and rewrites `shared/security/trustedKeys.js`. Rebuild and redeploy, or share the new `ar-register.json` for users to import from the Data tab.

## Project layout

```
ar/                signed AR element registration (bundled into the app)
shared/            pure JS (browser + tests)
  omni/            Fraction (BigInt), midpoint engine, chooser, verifier
  security/        AR registration signing + verification
  identity/        Omni ID passports, challenges, encrypted bundles
  local/           local receipts, one-file app backup
  notes/           notepad / document / sticky-note logic, spoken punctuation
  actions.js       action catalogue + gesture → action map
  hands/ voice/ wellness/ automation/ prefs.js platform.js
client/            React app (Vite)
  src/ar/          2D overlay, 3D Web AR, WebXR room AR, shared 3D twin model
  src/hooks/       camera, tracking, voice, registration, identity
  src/components/  verification gate, AR notes layer, Notes, Gestures, Data and other panels
scripts/sign-ar.mjs
tests/unit, tests/e2e
```

## Honest limits

- The Omni quantities are classical (Faulhaber, Euler–Maclaurin, Hurwitz ζ). What's new is the unified engine, the shared μ-library and the verified constant-time packaging. The fast HP path is double precision, with about 1e-15 relative error.
- 3D Web AR anchors to your hands and face, not to room surfaces. Surface-anchored AR needs ARCore (Android + Chrome), because browsers on laptops and iPhones don't expose surface tracking.
- The twin automates only what happens inside the app. With no server, nothing syncs automatically: use the JSON export and import.
- Voice recognition comes from the browser's Web Speech API (Chrome, Edge, Android Chrome, recent Safari). In Chrome and Edge the audio is sent to the vendor's speech service for transcription. Notes, camera, hands and face stay on the device. Switch off *voice → action* to keep the microphone off.
- Wellness tips are general guidance, not medical advice.
