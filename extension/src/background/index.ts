// Background service worker. All backend traffic is relayed through here.
//
// Why: WhatsApp Web is served over HTTPS, but the Apollon backend runs over
// plain HTTP on a private IP (192.168.x.x). A fetch from the content script
// runs in the page's HTTPS context and would be blocked as mixed content
// (localhost is exempt, a private IP is not). The background worker fetches
// with the extension's host_permissions, which bypasses both mixed-content and
// CORS restrictions for the declared host.

const API_URL = process.env.PLASMO_PUBLIC_API_URL;

export interface SummaryResult {
  originalText: string;
  summary: string;
  cached?: boolean;
}

type Request =
  | { name: "apollon-get-summary"; dataId: string }
  | {
      name: "apollon-summarize";
      dataId: string;
      base64: string;
      mimetype: string;
    };

type RelayResponse =
  | { ok: true; result: SummaryResult | null }
  | { ok: false; error: string };

function base64ToBlob(base64: string, mimetype: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimetype || "audio/ogg" });
}

// GET /api/summary/:id -> null on 404 (not summarized yet).
async function getSummary(dataId: string): Promise<SummaryResult | null> {
  const res = await fetch(
    `${API_URL}/api/summary/${encodeURIComponent(dataId)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cache lookup failed (${res.status})`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Cache lookup failed");
  return {
    originalText: json.originalText,
    summary: json.summary,
    cached: true,
  };
}

// POST /api/summarize (multipart): audio file + messageId.
async function summarize(
  dataId: string,
  base64: string,
  mimetype: string,
): Promise<SummaryResult> {
  const blob = base64ToBlob(base64, mimetype);
  const form = new FormData();
  const ext = (mimetype.split("/")[1] || "ogg").split(";")[0];
  form.append("audio", blob, `${dataId}.${ext}`);
  form.append("messageId", dataId);

  const res = await fetch(`${API_URL}/api/summarize`, {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Summarize failed (${res.status})`);
  }
  return {
    originalText: json.originalText,
    summary: json.summary,
    cached: json.cached,
  };
}

chrome.runtime.onMessage.addListener(
  (req: Request, _sender, sendResponse: (r: RelayResponse) => void) => {
    const handle = async (): Promise<RelayResponse> => {
      try {
        if (req.name === "apollon-get-summary") {
          return { ok: true, result: await getSummary(req.dataId) };
        }
        if (req.name === "apollon-summarize") {
          return {
            ok: true,
            result: await summarize(req.dataId, req.base64, req.mimetype),
          };
        }
        return { ok: false, error: `Unknown request: ${(req as any).name}` };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };
    handle().then(sendResponse);
    return true; // keep the message channel open for the async response
  },
);
