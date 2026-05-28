# Apollon Extension

Browser extension (Plasmo + React + TS) that adds a button next to every voice
message in **WhatsApp Web**. On click the audio is extracted, sent to the Apollon
backend, transcribed + summarized, and shown inline.

## Architecture

WhatsApp voice messages are end-to-end encrypted (`.enc` on the CDN, the decoded
blob only appears lazily on playback). Extraction therefore runs in two worlds:

```
MAIN world (src/contents/wa-js.ts)          ISOLATED world (content/UI)
  WPP.chat.downloadMedia(dataId)   --post-->  SummarizeWidget
  returns the decrypted blob       message    FormData -> fetch localhost:3000
```

The MAIN-world code is subject to WhatsApp's CSP and may not fetch
`localhost:3000` — the isolated content script can, via `host_permissions`.

| File | Role |
|------|------|
| `src/contents/wa-js.ts` | MAIN world; loads `@wppconnect/wa-js`, downloads + decrypts audio, postMessage bridge |
| `src/contents/whatsapp-ui.tsx` | Plasmo CSUI; anchors one widget per voice message |
| `src/features/SummarizeWidget.tsx` | Button + panel, lazy cache check, click flow |
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
   - Console: wa-js "ready" without errors.
   - Button appears next to play -> click -> spinner -> summary box.
   - An already-summarized message shows a green "cached" badge immediately on reload.
   - Network: `GET /api/summary/...` (lazy), `POST /api/summarize` (200).

## To verify against the live DOM

WhatsApp changes its markup often. The only WA-specific selector lives in
`src/contents/whatsapp-ui.tsx` (`PLAY_ICON_SELECTORS`). If the button does not
appear: open DevTools on a voice message and check the current play-icon name
(`span[data-icon="..."]`), then adjust the list. The anchor stays structural via
`[data-id]` + play icon, deliberately **not** via `aria-label` (locale-dependent).

## Note

Module injection formally violates the WhatsApp ToS (theoretical ban risk); for
private use this is generally not a concern.
