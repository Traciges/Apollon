import type {
  PlasmoCSConfig,
  PlasmoCSUIProps,
  PlasmoGetInlineAnchorList,
  PlasmoGetStyle
} from "plasmo"

import SummarizeWidget from "~features/SummarizeWidget"

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"]
}

console.log("[Apollon] content script loaded")

// Set to false to silence the diagnostic logging once the selector is verified.
const DEBUG = true

// Voice notes (PTT) carry a "ptt-status" microphone icon — this reliably marks
// a voice message and is locale-independent. The actual play control uses
// "media-play" (shared with video, so not usable on its own) or shows
// "audio-download" before the media is fetched.
//
// VERIFY ON BUILD: open web.whatsapp.com devtools on a voice note and confirm
// these data-icon names still match; WhatsApp renames them across versions.
const VOICE_MARKER = 'span[data-icon="ptt-status"]'
const PLAY_CONTROL_SELECTOR = [
  'span[data-icon="media-play"]',
  'span[data-icon="audio-download"]',
  'span[data-icon="audio-play"]',
  'span[data-icon="ptt-play"]'
].join(",")

function log(...args: unknown[]) {
  if (DEBUG) console.log("[Apollon]", ...args)
}

function findPlayButtons(): HTMLElement[] {
  const markers = Array.from(
    document.querySelectorAll<HTMLElement>(VOICE_MARKER)
  )
  const anchors: HTMLElement[] = []
  const seen = new Set<Element>()
  for (const marker of markers) {
    const container = marker.closest<HTMLElement>("[data-id]")
    if (!container || seen.has(container)) continue
    seen.add(container)
    // Prefer to sit next to the play/download control; fall back to the marker.
    const control =
      container.querySelector<HTMLElement>(PLAY_CONTROL_SELECTOR) ?? marker
    const button =
      control.closest<HTMLElement>('button, div[role="button"]') ??
      (control.parentElement as HTMLElement | null) ??
      control
    anchors.push(button)
  }
  return anchors
}

export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () => {
  const buttons = findPlayButtons()
  if (DEBUG) {
    if (buttons.length === 0) {
      // Nothing matched — dump the play/audio-ish icons present so we can see
      // what WhatsApp actually calls the control now.
      const iconNames = [
        ...new Set(
          Array.from(document.querySelectorAll("[data-icon]"))
            .map((e) => e.getAttribute("data-icon") || "")
            .filter((v) => /play|ptt|audio|mic|voice/i.test(v))
        )
      ]
      log(
        "no play buttons matched. Present play/audio data-icons:",
        iconNames.length ? iconNames : "(none — open a chat with a voice message)"
      )
    } else {
      log(`matched ${buttons.length} voice message(s)`)
    }
  }
  return buttons.map((element) => ({
    element,
    insertPosition: "afterend"
  }))
}

// Inject the spinner keyframes into the shadow root (component styles are
// inline, but @keyframes must live in a stylesheet).
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `@keyframes apollon-spin { to { transform: rotate(360deg); } }`
  return style
}

export default function WhatsAppInlineWidget({ anchor }: PlasmoCSUIProps) {
  const element = anchor?.element as HTMLElement | undefined
  const container = element?.closest<HTMLElement>("[data-id]")
  const dataId = container?.getAttribute("data-id")
  if (!dataId) return null
  return <SummarizeWidget dataId={dataId} />
}
