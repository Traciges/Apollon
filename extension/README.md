# Apollon Extension

Browser extension (Plasmo + React + TS) that adds a button next to every voice
message in **WhatsApp Web**. On click the audio is extracted, sent to the Apollon
backend, transcribed + summarized, and shown inline.

## Architecture

WhatsApp voice messages are end-to-end encrypted (`.enc` on the CDN, the decoded
blob only appears lazily on playback). We deliberately do **not** touch WhatsApp's
internal webpack store (the `wa-js` / `window.Store` approach breaks on every WA
webpack rename, e.g. wa-js #3419). Instead the MAIN-world bridge lets WhatsApp
decrypt the audio itself by triggering playback, and captures the resulting Blob
via two store-independent hooks (`URL.createObjectURL` + a muted `HTMLMediaElement.play`).
Extraction therefore runs in two worlds:

```
MAIN world (src/contents/media-bridge.ts)   ISOLATED world (content/UI)
  click play (muted) -> WA decrypts --post-->  SummarizeWidget
  capture audio Blob, base64       message    FormData -> fetch localhost:3000
```

The MAIN-world code is subject to WhatsApp's CSP and may not fetch
`localhost:3000` — the isolated content script can, via `host_permissions`.

| File | Role |
|------|------|
| `src/contents/media-bridge.ts` | MAIN world; triggers playback, captures the decrypted audio Blob, postMessage bridge |
| `src/contents/whatsapp-ui.tsx` | Plasmo CSUI; anchors one widget per voice message |
| `src/features/SummarizeWidget.tsx` | Button + panel, lazy cache check, click flow |
| `src/lib/wa-selectors.ts` | WA-specific selectors (voice marker + play control), shared |
| `src/lib/extract.ts` | Bridge helper (postMessage + timeout) |
| `src/lib/api.ts` | Backend client (`GET /api/summary/:id`, `POST /api/summarize`) |

## Setup

```bash
npm install
npm run dev          # -> build/chrome-mv3-dev
```

`.env` sets `PLASMO_PUBLIC_API_URL=http://localhost:3000`.

## Loading

1. Start the backend from the repo root: `npm run dev` (port 3000, `OPENAI_API_KEY` in `.env`).
2. `chrome://extensions` -> Developer Mode -> **Load unpacked** -> `build/chrome-mv3-dev`.
3. Open `web.whatsapp.com`, a chat with a voice message.
   - Console: bridge logs `BRIDGE_READY`, no errors.
   - Button appears next to play -> click -> a short (muted) playback is triggered -> spinner -> summary box.
   - An already-summarized message shows a green "cached" badge immediately on reload.
   - Network: `GET /api/summary/...` (lazy), `POST /api/summarize` (200).

## To verify against the live DOM

WhatsApp changes its markup often. The WA-specific selectors live in
`src/lib/wa-selectors.ts` (`VOICE_MARKER`, `PLAY_CONTROL_SELECTOR`). If the button
does not appear, or extraction never triggers playback: open DevTools on a voice
message and check the current icon names (`span[data-icon="..."]`), then adjust
the lists. The anchor stays structural via `[data-id]` + play icon, deliberately
**not** via `aria-label` (locale-dependent).

Audio capture relies on WhatsApp building a `blob:` `<audio>` source on playback
(caught via `URL.createObjectURL`). If a WA update ever changes that, adjust the
capture in `src/contents/media-bridge.ts`.

## Note

Triggering playback / reading WhatsApp's in-page media formally violates the
WhatsApp ToS (theoretical ban risk); for private use this is generally not a concern.
