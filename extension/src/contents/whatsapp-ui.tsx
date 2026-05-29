import type {
  PlasmoCSConfig,
  PlasmoCSUIProps,
  PlasmoGetInlineAnchorList,
  PlasmoGetStyle
} from "plasmo"

import SummarizeWidget from "~features/SummarizeWidget"
import { VOICE_MARKER } from "~lib/wa-selectors"

export const config: PlasmoCSConfig = {
  matches: ["https://web.whatsapp.com/*"]
}

console.log("[Apollon] content script loaded")

// Set to false to silence the diagnostic logging once the selector is verified.
const DEBUG = true

function log(...args: unknown[]) {
  if (DEBUG) console.log("[Apollon]", ...args)
}

// Resolve the actual (content-sized) chat bubble for a voice message. The
// `.message-in` / `.message-out` wrapper spans the full chat width, so we can't
// anchor to it — the button would land at the far chat edge. Instead we walk up
// from the voice marker and pick the outermost ancestor that is still clearly
// narrower than the row: that's the coloured bubble. Its element is stable
// across playback (WhatsApp only swaps the inner play icon), so anchoring here
// gives exactly one widget per message.
function resolveBubble(marker: HTMLElement, row: HTMLElement): HTMLElement {
  const rowWidth = row.getBoundingClientRect().width
  let el: HTMLElement | null = marker.parentElement
  let bubble: HTMLElement | null = null
  while (el && el !== row) {
    const w = el.getBoundingClientRect().width
    if (w > 0 && rowWidth > 0 && w <= rowWidth * 0.92) bubble = el
    el = el.parentElement
  }
  return bubble ?? row
}

// One anchor per voice message, deduped by the [data-id] row.
function findVoiceBubbles(): HTMLElement[] {
  const markers = Array.from(
    document.querySelectorAll<HTMLElement>(VOICE_MARKER)
  )
  const bubbles: HTMLElement[] = []
  const seen = new Set<Element>()
  for (const marker of markers) {
    const row = marker.closest<HTMLElement>("[data-id]")
    if (!row || seen.has(row)) continue
    seen.add(row)
    bubbles.push(resolveBubble(marker, row))
  }
  return bubbles
}

export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () => {
  const bubbles = findVoiceBubbles()
  if (DEBUG) {
    if (bubbles.length === 0) {
      const iconNames = [
        ...new Set(
          Array.from(document.querySelectorAll("[data-icon]"))
            .map((e) => e.getAttribute("data-icon") || "")
            .filter((v) => /play|ptt|audio|mic|voice/i.test(v))
        )
      ]
      log(
        "no voice messages matched. Present play/audio data-icons:",
        iconNames.length ? iconNames : "(none — open a chat with a voice message)"
      )
    } else {
      log(`matched ${bubbles.length} voice message(s)`)
    }
  }
  return bubbles.map((element) => ({
    element,
    insertPosition: "beforeend"
  }))
}

// The host overlays the bubble (which the widget makes position: relative), so
// the button can be placed in the free gutter right next to it — like
// WhatsApp's own reaction affordance. pointer-events are disabled on the
// overlay and re-enabled on the button, so the bubble stays fully clickable.
// Keyframes for the button spinner live here (shadow root); the portal panel
// injects its own copy.
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    :host {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
    }
    @keyframes apollon-spin { to { transform: rotate(360deg); } }
  `
  return style
}

export default function WhatsAppInlineWidget({ anchor }: PlasmoCSUIProps) {
  const bubble = anchor?.element as HTMLElement | undefined
  const row = bubble?.closest<HTMLElement>("[data-id]")
  const dataId = row?.getAttribute("data-id")
  if (!bubble || !row || !dataId) return null
  return <SummarizeWidget dataId={dataId} bubble={bubble} row={row} />
}
