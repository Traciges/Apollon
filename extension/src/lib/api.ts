// Backend client. The actual fetches live in the background service worker
// (see src/background/index.ts) because the content script runs in WhatsApp's
// HTTPS context and cannot reach the HTTP backend directly. Here we just relay.

export interface SummaryResult {
  originalText: string
  summary: string
  cached?: boolean
}

type RelayResponse =
  | { ok: true; result: SummaryResult | null }
  | { ok: false; error: string }

async function send(message: unknown): Promise<SummaryResult | null> {
  const raw = await chrome.runtime.sendMessage(message)
  const res: RelayResponse | undefined = raw
  if (!res) throw new Error("No response from background worker")
  if (!res.ok) throw new Error("error" in res ? res.error : "Request failed")
  return res.result
}

export function getSummary(dataId: string): Promise<SummaryResult | null> {
  return send({ name: "apollon-get-summary", dataId })
}

export async function postSummarize(
  dataId: string,
  base64: string,
  mimetype: string,
  senderName?: string
): Promise<SummaryResult> {
  const result = await send({
    name: "apollon-summarize",
    dataId,
    base64,
    mimetype,
    senderName
  })
  if (!result) throw new Error("Summarize returned no result")
  return result
}
