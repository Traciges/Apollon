import { Bot, ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { getSummary, postSummarize } from "~lib/api"
import { requestAudio } from "~lib/extract"
import { getSenderName } from "~lib/sender"

type Status = "idle" | "loading" | "cached" | "done" | "error"

// Module-level guard so each voice note's cache is probed only once, even as
// Plasmo re-mounts widgets while WhatsApp recycles DOM nodes during scroll.
const probed = new Set<string>()

const PANEL_WIDTH = 380

export interface SummarizeWidgetProps {
  dataId: string
  bubble: HTMLElement
  row: HTMLElement
}

interface PanelPos {
  left: number
  maxHeight: number
  top?: number
  bottom?: number
}

export default function SummarizeWidget({
  dataId,
  bubble,
  row
}: SummarizeWidgetProps) {
  const [status, setStatus] = useState<Status>("idle")
  const [summary, setSummary] = useState("")
  const [original, setOriginal] = useState("")
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const dark = useMemo(isDarkTheme, [])
  const s = useMemo(() => buildStyles(dark), [dark])
  // Incoming messages (false_…) have free space to the right of the bubble;
  // outgoing (true_…) to the left. Place the button in whichever gutter exists.
  const incoming = dataId.startsWith("false_")

  // The bubble must be a positioning context for the absolutely-placed host.
  useEffect(() => {
    if (getComputedStyle(bubble).position === "static") {
      bubble.style.position = "relative"
    }
  }, [bubble])

  // Lazy cache check: only when the message first scrolls into view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        observer.disconnect()
        if (probed.has(dataId)) return
        probed.add(dataId)
        getSummary(dataId)
          .then((result) => {
            if (!result) return
            setSummary(result.summary)
            setOriginal(result.originalText)
            setStatus("cached")
          })
          .catch(() => {
            // Backend down / network error: stay idle, allow manual retry.
            probed.delete(dataId)
          })
      },
      { threshold: 0.1 }
    )
    observer.observe(bubble)
    return () => observer.disconnect()
  }, [dataId, bubble])

  // Position the fixed popover relative to the button, flipping above the
  // button when there isn't enough room below. Re-runs on open, scroll, resize.
  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const btn = buttonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 12
      const left = clamp(r.right - PANEL_WIDTH, 8, vw - PANEL_WIDTH - 8)
      const spaceBelow = vh - r.bottom - margin
      const spaceAbove = r.top - margin
      // Open upward only when there's clearly too little room below.
      const openUp = spaceBelow < 280 && spaceAbove > spaceBelow
      const maxHeight = Math.floor(
        Math.min(openUp ? spaceAbove : spaceBelow, vh * 0.85)
      )
      setPos(
        openUp
          ? { left, bottom: vh - r.top + 8, maxHeight }
          : { left, top: r.bottom + 8, maxHeight }
      )
    }
    reposition()
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  async function handleClick() {
    if (status === "cached" || status === "done") {
      setOpen((o) => !o)
      return
    }
    if (status === "loading") return

    setStatus("loading")
    setError("")
    setOpen(true)
    try {
      const { base64, mimetype } = await requestAudio(dataId)
      const senderName = getSenderName(row, dataId)
      const result = await postSummarize(dataId, base64, mimetype, senderName)
      setSummary(result.summary)
      setOriginal(result.originalText)
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus("error")
    }
  }

  const hasSummary = status === "cached" || status === "done"
  const Icon = hasSummary ? Sparkles : Bot

  const panel =
    open && (status === "loading" || hasSummary || status === "error") && pos ? (
      <>
        <div style={s.backdrop} onClick={() => setOpen(false)} />
        <div
          style={{
            ...s.panel,
            left: pos.left,
            maxHeight: pos.maxHeight,
            ...(pos.top !== undefined ? { top: pos.top } : {}),
            ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {})
          }}
          role="dialog"
          aria-label="Apollon Zusammenfassung">
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>
              <Sparkles size={14} /> Apollon
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              style={s.iconBtn}>
              <X size={16} />
            </button>
          </div>

          {status === "loading" && (
            <div style={s.loadingRow}>
              <Loader2 size={15} style={s.spin} />
              Wird transkribiert & zusammengefasst…
            </div>
          )}

          {status === "error" && <div style={s.errorBox}>Fehler: {error}</div>}

          {hasSummary && (
            <>
              <div style={s.summaryBody}>{renderSummary(summary, s)}</div>
              {original && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOriginal((v) => !v)}
                    style={s.toggle}>
                    {showOriginal ? (
                      <ChevronUp size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                    {showOriginal
                      ? "Transkript ausblenden"
                      : "Transkript anzeigen"}
                  </button>
                  {showOriginal && (
                    <div style={s.originalText}>{original}</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </>
    ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        title={
          hasSummary
            ? "Zusammenfassung anzeigen"
            : "Sprachnachricht zusammenfassen"
        }
        aria-label="Sprachnachricht zusammenfassen"
        style={{
          ...s.button,
          ...(incoming ? s.buttonGutterRight : s.buttonGutterLeft),
          ...(hasSummary ? s.buttonReady : {}),
          ...(status === "error" ? s.buttonError : {})
        }}>
        {status === "loading" ? (
          <Loader2 size={15} style={s.spin} />
        ) : (
          <Icon size={15} />
        )}
      </button>
      {panel ? createPortal(panel, getPortalRoot()) : null}
    </>
  )
}

// --- helpers ----------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Detect WhatsApp's active theme from the page background luminance, so the
// panel matches light/dark mode regardless of how WA stores the preference.
function isDarkTheme(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor
  const m = bg.match(/\d+(\.\d+)?/g)
  if (!m || m.length < 3) return false
  const [r, g, b] = m.map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

// Single shared body-level node for all popovers (fixed positioning here is not
// trapped by WhatsApp's transformed / overflow-hidden ancestors).
let portalRoot: HTMLElement | null = null
function getPortalRoot(): HTMLElement {
  if (!portalRoot || !portalRoot.isConnected) {
    portalRoot = document.createElement("div")
    portalRoot.id = "apollon-portal-root"
    // Keyframes for the panel spinner (the shadow-root copy isn't visible here).
    const style = document.createElement("style")
    style.textContent = `@keyframes apollon-spin { to { transform: rotate(360deg); } }`
    portalRoot.appendChild(style)
    document.body.appendChild(portalRoot)
  }
  return portalRoot
}

// Render the summary: consecutive "- " / "•" / "* " lines become a bullet list,
// everything else becomes a paragraph.
function renderSummary(text: string, s: Styles): React.ReactNode {
  const lines = text.split("\n").map((l) => l.trim())
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []

  const flush = () => {
    if (!bullets.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={s.list}>
        {bullets.map((b, i) => (
          <li key={i} style={s.listItem}>
            {b}
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (const line of lines) {
    if (!line) continue
    const m = line.match(/^[-•*]\s+(.*)$/)
    if (m) {
      bullets.push(m[1])
    } else {
      flush()
      blocks.push(
        <p key={`p-${blocks.length}`} style={s.paragraph}>
          {line}
        </p>
      )
    }
  }
  flush()
  return blocks
}

// --- styles -----------------------------------------------------------------

type Styles = Record<string, React.CSSProperties>

function buildStyles(dark: boolean): Styles {
  const accent = "#00a884"
  const panelBg = dark ? "#233138" : "#ffffff"
  const panelText = dark ? "#e9edef" : "#111b21"
  const subtle = dark ? "#8696a0" : "#667781"
  const border = dark ? "#2f3b43" : "#e9edef"
  const idleBg = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"
  const idleColor = dark ? "#aebac1" : "#54656f"

  return {
    button: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "auto",
      width: 28,
      height: 28,
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      background: idleBg,
      color: idleColor,
      padding: 0,
      boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
      transition: "background 0.15s ease, color 0.15s ease, transform 0.1s ease",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    },
    // Sit just outside the bubble, in the row's free gutter.
    buttonGutterRight: {
      left: "100%",
      marginLeft: 8
    },
    buttonGutterLeft: {
      right: "100%",
      marginRight: 8
    },
    buttonReady: {
      background: accent,
      color: "#ffffff"
    },
    buttonError: {
      background: "#fde2e2",
      color: "#c0392b"
    },
    backdrop: {
      position: "fixed",
      inset: 0,
      zIndex: 2147483646,
      background: "transparent"
    },
    panel: {
      position: "fixed",
      zIndex: 2147483647,
      width: PANEL_WIDTH,
      maxWidth: "92vw",
      maxHeight: "70vh",
      overflowY: "auto",
      background: panelBg,
      color: panelText,
      borderRadius: 14,
      boxShadow: "0 10px 36px rgba(0,0,0,0.28)",
      border: `1px solid ${border}`,
      padding: 14,
      fontSize: 13.5,
      lineHeight: 1.5,
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    },
    panelHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: `1px solid ${border}`
    },
    panelTitle: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 0.2,
      color: accent
    },
    iconBtn: {
      display: "inline-flex",
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: subtle,
      padding: 2,
      borderRadius: 6
    },
    loadingRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: subtle,
      padding: "4px 0"
    },
    errorBox: {
      color: dark ? "#f4a39c" : "#c0392b",
      background: dark ? "rgba(192,57,43,0.18)" : "#fde2e2",
      borderRadius: 8,
      padding: "8px 10px",
      wordBreak: "break-word"
    },
    summaryBody: {
      wordBreak: "break-word"
    },
    paragraph: {
      margin: "0 0 8px 0"
    },
    list: {
      margin: "0 0 8px 0",
      paddingLeft: 18,
      listStyle: "disc"
    },
    listItem: {
      margin: "0 0 5px 0"
    },
    toggle: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
      border: "none",
      background: "transparent",
      color: accent,
      cursor: "pointer",
      fontSize: 12.5,
      fontWeight: 600,
      padding: 0
    },
    originalText: {
      marginTop: 8,
      paddingTop: 8,
      borderTop: `1px solid ${border}`,
      color: subtle,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    spin: {
      animation: "apollon-spin 0.8s linear infinite",
      flexShrink: 0
    }
  }
}
