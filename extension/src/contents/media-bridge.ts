import type { PlasmoCSConfig } from "plasmo"

import { PLAY_CONTROL_SELECTOR } from "~lib/wa-selectors"

// Runs inside WhatsApp Web's own JS context (MAIN world), at document_start.
//
// WhatsApp voice notes are E2E-encrypted (.enc on the CDN); the decrypted bytes
// only exist in-page once WhatsApp itself decrypts them for playback. We do NOT
// touch WhatsApp's internal webpack store (that approach — wa-js / window.Store —
// breaks on every WA webpack rename, e.g. wa-js #3419). Instead we let WhatsApp
// decrypt the audio by triggering playback and capture the resulting Blob via
// two store-independent hooks:
//
//   1. URL.createObjectURL — patched to remember every audio/* Blob WhatsApp
//      builds for its <audio> element (this is the decrypted audio).
//   2. HTMLMediaElement.play — patched to mute while we extract, so triggering
//      playback stays silent.
//
// The decrypted bytes are handed to the isolated content script via
// window.postMessage (the MAIN world is blocked from the HTTP backend by CSP).
export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"],
  world: "MAIN",
  run_at: "document_start"
}

const APOLLON_REQ = "apollon"
const APOLLON_RES = "apollon-main"

const EXTRACT_TIMEOUT_MS = 25_000

// --- Capture hooks (installed once at document_start) -----------------------

interface CapturedBlob {
  blob: Blob
  at: number
}

// Audio blobs WhatsApp created via createObjectURL, newest last. Kept small.
const audioBlobs: CapturedBlob[] = []

// While > 0, an extraction is in progress: media playback is forced silent.
let extracting = 0

function installHooks() {
  const nativeCreate = URL.createObjectURL.bind(URL)
  URL.createObjectURL = function (obj: Blob | MediaSource): string {
    try {
      if (obj instanceof Blob && obj.type && obj.type.startsWith("audio/")) {
        audioBlobs.push({ blob: obj, at: Date.now() })
        // Don't let the buffer grow unbounded across a long session.
        if (audioBlobs.length > 8) audioBlobs.shift()
      }
    } catch {
      // never break WhatsApp's own createObjectURL
    }
    return nativeCreate(obj as Blob)
  }

  const nativePlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (extracting > 0) {
      this.muted = true
      this.volume = 0
    }
    return nativePlay.apply(this)
  }
}

installHooks()

// --- Helpers ----------------------------------------------------------------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // result is a data URL: "data:<mime>;base64,<payload>" — strip the prefix.
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"))
    reader.readAsDataURL(blob)
  })
}

// data-id values contain a JID with characters that are awkward in an attribute
// selector, so match by iterating instead of CSS-escaping.
function findContainer(dataId: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>("[data-id]")
  for (const node of Array.from(nodes)) {
    if (node.getAttribute("data-id") === dataId) return node
  }
  return null
}

function findPlayControl(container: HTMLElement): HTMLElement | null {
  const icon = container.querySelector<HTMLElement>(PLAY_CONTROL_SELECTOR)
  if (!icon) return null
  return (
    icon.closest<HTMLElement>('button, div[role="button"]') ??
    (icon.parentElement as HTMLElement | null) ??
    icon
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Poll until a new audio Blob shows up (primary) or the container's <audio> gains
// a blob: src we can fetch (fallback). `since` marks the start of this attempt so
// we ignore blobs captured for earlier messages.
async function waitForAudio(
  container: HTMLElement,
  since: number
): Promise<Blob> {
  const deadline = Date.now() + EXTRACT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const captured = audioBlobs.find((c) => c.at >= since)
    if (captured) return captured.blob

    const audio = container.querySelector("audio")
    const src = audio?.getAttribute("src") || audio?.src || ""
    if (src.startsWith("blob:")) {
      const res = await fetch(src)
      return await res.blob()
    }
    await delay(120)
  }
  throw new Error("No decrypted audio appeared after triggering playback")
}

function stopPlayback(container: HTMLElement) {
  const audio = container.querySelector("audio")
  if (audio) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // ignore
    }
  }
}

// --- Extraction -------------------------------------------------------------

async function extract(dataId: string) {
  let container: HTMLElement | null = null
  extracting++
  try {
    container = findContainer(dataId)
    if (!container) throw new Error("Voice message not found in the DOM")

    const control = findPlayControl(container)
    if (!control) throw new Error("Play control not found for this voice message")

    const since = Date.now()
    control.click() // triggers WhatsApp's own download + decryption

    const blob = await waitForAudio(container, since)
    const base64 = await blobToBase64(blob)
    const mimetype = blob.type || "audio/ogg"

    window.postMessage(
      { source: APOLLON_RES, type: "EXTRACT_RESULT", dataId, base64, mimetype },
      "*"
    )
  } catch (err) {
    window.postMessage(
      {
        source: APOLLON_RES,
        type: "EXTRACT_ERROR",
        dataId,
        error: err instanceof Error ? err.message : String(err)
      },
      "*"
    )
  } finally {
    if (container) stopPlayback(container)
    extracting--
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== APOLLON_REQ || data.type !== "EXTRACT") return
  if (typeof data.dataId !== "string") return
  void extract(data.dataId)
})

// Let the isolated world know the bridge is mounted (useful for diagnostics).
window.postMessage({ source: APOLLON_RES, type: "BRIDGE_READY" }, "*")
