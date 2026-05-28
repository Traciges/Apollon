import type { PlasmoCSConfig } from "plasmo"
import * as WPP from "@wppconnect/wa-js"

// Runs inside WhatsApp Web's own JS context (MAIN world). Only this world can
// reach WhatsApp's internal module store, so media download + decryption of the
// E2E-encrypted voice notes happens here. The decrypted bytes are handed to the
// isolated content script via window.postMessage (which in turn talks to the
// Apollon backend — the MAIN world is blocked from localhost by WhatsApp's CSP).
export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"],
  world: "MAIN",
  run_at: "document_start"
}

declare global {
  interface Window {
    WPP: typeof WPP
  }
}

const APOLLON_REQ = "apollon"
const APOLLON_RES = "apollon-main"

// Make WPP reachable for debugging and inject the loader that hooks into WA's
// webpack modules. injectLoader is idempotent enough for our single injection.
window.WPP = WPP
WPP.loader.injectLoader()

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

function whenReady(): Promise<void> {
  if (WPP.isReady) return Promise.resolve()
  return new Promise<void>((resolve) => {
    // onReady fires once the internal modules are usable; it also resolves
    // immediately if readiness already happened.
    WPP.loader.onReady(() => resolve())
  })
}

async function extract(dataId: string) {
  try {
    await whenReady()
    const blob = await WPP.chat.downloadMedia(dataId)
    if (!blob) {
      throw new Error("downloadMedia returned no data")
    }
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
