// Isolated-world side of the bridge. Asks the MAIN-world wa-js script to
// download + decrypt a voice note, then resolves with the decoded bytes.

export interface ExtractedAudio {
  base64: string
  mimetype: string
}

const APOLLON_REQ = "apollon"
const APOLLON_RES = "apollon-main"

export function requestAudio(
  dataId: string,
  timeoutMs = 30_000
): Promise<ExtractedAudio> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== APOLLON_RES) return
      if (data.dataId !== dataId) return

      if (data.type === "EXTRACT_RESULT") {
        cleanup()
        resolve({ base64: data.base64, mimetype: data.mimetype })
      } else if (data.type === "EXTRACT_ERROR") {
        cleanup()
        reject(new Error(data.error || "Extraction failed in page context"))
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Timed out waiting for audio extraction"))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      window.removeEventListener("message", onMessage)
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ source: APOLLON_REQ, type: "EXTRACT", dataId }, "*")
  })
}
