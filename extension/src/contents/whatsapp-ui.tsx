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

// Candidate selectors for the voice-note play control. WhatsApp changes its
// markup often and the data-icon name has drifted over versions, so we match
// any of these inside a [data-id] message container. Anchoring on the icon
// (not an aria-label) keeps this locale-independent.
//
// VERIFY ON BUILD: open web.whatsapp.com devtools on a voice note and confirm
// one of these still matches; adjust the list if WA renamed the icon.
const PLAY_ICON_SELECTORS = [
  'span[data-icon="audio-play"]',
  'span[data-icon="ptt-play"]',
  'span[data-icon="audio-play-pip"]'
].join(",")

function findPlayButtons(): HTMLElement[] {
  const icons = Array.from(
    document.querySelectorAll<HTMLElement>(PLAY_ICON_SELECTORS)
  )
  const anchors: HTMLElement[] = []
  const seen = new Set<Element>()
  for (const icon of icons) {
    const container = icon.closest<HTMLElement>("[data-id]")
    if (!container || seen.has(container)) continue
    seen.add(container)
    // Anchor to the clickable button wrapping the icon, falling back to the
    // icon's parent so we always render next to the play control.
    const button =
      icon.closest<HTMLElement>('button, div[role="button"]') ??
      (icon.parentElement as HTMLElement | null) ??
      icon
    anchors.push(button)
  }
  return anchors
}

export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () => {
  return findPlayButtons().map((element) => ({
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
