// Best-effort extraction of the sender's display name for a voice message, so
// the summary can say "Jenny hat …" instead of "Der Sprecher hat …".
//
// Runs in the isolated content-script world, which shares WhatsApp's DOM. Tries,
// in order:
//   1. The per-message `data-pre-plain-text` ("[12:46, 29.05.2026] Jenny: ") —
//      most precise, also correct in group chats, but often absent on PTT.
//   2. The open conversation's header title (the 1:1 contact / group name).
// Returns undefined when nothing reliable is found; the backend then falls back
// to neutral phrasing.

function fromPrePlainText(container: HTMLElement): string | undefined {
  const el = container.querySelector<HTMLElement>("[data-pre-plain-text]")
  const raw = el?.getAttribute("data-pre-plain-text")
  if (!raw) return undefined
  // Format: "[<time>, <date>] <Name>: "
  const match = raw.match(/]\s*(.+?):\s*$/)
  const name = match?.[1]?.trim()
  return name || undefined
}

function fromChatHeader(): string | undefined {
  const header = document.querySelector<HTMLElement>("#main header")
  if (!header) return undefined
  const titled = header.querySelector<HTMLElement>("span[title]")
  const title = titled?.getAttribute("title")?.trim()
  if (title) return title
  const auto = header
    .querySelector<HTMLElement>('span[dir="auto"]')
    ?.textContent?.trim()
  return auto || undefined
}

export function getSenderName(
  container: HTMLElement,
  dataId: string
): string | undefined {
  const fromMessage = fromPrePlainText(container)
  if (fromMessage) return fromMessage

  // Only fall back to the header for incoming messages (true_ = sent by me).
  if (dataId.startsWith("false_")) {
    return fromChatHeader()
  }
  return undefined
}
