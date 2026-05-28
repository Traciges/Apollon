import { Bot, ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { getSummary, postSummarize } from "~lib/api"
import { requestAudio } from "~lib/extract"

type Status = "idle" | "loading" | "cached" | "done" | "error"

// Module-level guard so each voice note's cache is probed only once, even as
// Plasmo re-mounts widgets while WhatsApp recycles DOM nodes during scroll.
const probed = new Set<string>()

export interface SummarizeWidgetProps {
  dataId: string
}

export default function SummarizeWidget({ dataId }: SummarizeWidgetProps) {
  const [status, setStatus] = useState<Status>("idle")
  const [summary, setSummary] = useState("")
  const [original, setOriginal] = useState("")
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Lazy cache check: only when the widget first scrolls into view.
  useEffect(() => {
    if (!dataId || !rootRef.current) return
    const el = rootRef.current
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
    observer.observe(el)
    return () => observer.disconnect()
  }, [dataId])

  async function handleClick() {
    // If we already have a summary, just toggle the panel.
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
      const result = await postSummarize(dataId, base64, mimetype)
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

  return (
    <div ref={rootRef} style={styles.wrap}>
      <button
        type="button"
        onClick={handleClick}
        title={
          hasSummary
            ? "Zusammenfassung anzeigen"
            : "Sprachnachricht zusammenfassen"
        }
        aria-label="Sprachnachricht zusammenfassen"
        style={{
          ...styles.button,
          ...(hasSummary ? styles.buttonReady : {}),
          ...(status === "error" ? styles.buttonError : {})
        }}>
        {status === "loading" ? (
          <Loader2 size={16} style={styles.spin} />
        ) : (
          <Icon size={16} />
        )}
      </button>

      {open && (status === "loading" || hasSummary || status === "error") && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>
              <Sparkles size={13} /> Apollon
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
              style={styles.iconBtn}>
              <X size={14} />
            </button>
          </div>

          {status === "loading" && (
            <div style={styles.loadingRow}>
              <Loader2 size={14} style={styles.spin} /> Wird transkribiert &
              zusammengefasst…
            </div>
          )}

          {status === "error" && (
            <div style={styles.errorBox}>Fehler: {error}</div>
          )}

          {hasSummary && (
            <>
              <div style={styles.summaryText}>{summary}</div>
              {original && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowOriginal((s) => !s)}
                    style={styles.toggle}>
                    {showOriginal ? (
                      <ChevronUp size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    {showOriginal ? "Transkript ausblenden" : "Transkript anzeigen"}
                  </button>
                  {showOriginal && (
                    <div style={styles.originalText}>{original}</div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    marginLeft: 6,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    background: "rgba(0,0,0,0.06)",
    color: "#54656f",
    padding: 0,
    transition: "background 0.15s ease, color 0.15s ease"
  },
  buttonReady: {
    background: "#d9fdd3",
    color: "#1da851"
  },
  buttonError: {
    background: "#fde2e2",
    color: "#c0392b"
  },
  panel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    zIndex: 2147483647,
    width: 300,
    maxWidth: "80vw",
    background: "#ffffff",
    color: "#111b21",
    borderRadius: 10,
    boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
    border: "1px solid #e9edef",
    padding: 12,
    fontSize: 13,
    lineHeight: 1.45
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  panelTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontWeight: 600,
    fontSize: 12,
    color: "#1da851"
  },
  iconBtn: {
    display: "inline-flex",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#54656f",
    padding: 2
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#54656f"
  },
  errorBox: {
    color: "#c0392b",
    background: "#fde2e2",
    borderRadius: 6,
    padding: "6px 8px",
    wordBreak: "break-word"
  },
  summaryText: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    marginTop: 8,
    border: "none",
    background: "transparent",
    color: "#1da851",
    cursor: "pointer",
    fontSize: 12,
    padding: 0
  },
  originalText: {
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1px solid #e9edef",
    color: "#54656f",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  spin: {
    animation: "apollon-spin 0.8s linear infinite"
  }
}
