import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { transcribeAudio, summarizeText } from "../services/openai.js";
import { getSummaryById, saveSummary } from "../db/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".ogg";
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`Cleanup error for ${filePath}:`, err.message);
    }
  }
}

const router = Router();

router.get("/summary/:id", (req, res) => {
  const row = getSummaryById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, error: "Summary not found." });
  }
  return res.json({
    success: true,
    originalText: row.original_text,
    summary: row.summary_text,
  });
});

router.post("/summarize", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No audio file uploaded. Expected field: 'audio'.",
      });
    }

    const messageId = req.body?.messageId;
    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: "Missing 'messageId' field in form-data.",
      });
    }

    const existing = getSummaryById(messageId);
    if (existing) {
      return res.json({
        success: true,
        originalText: existing.original_text,
        summary: existing.summary_text,
        cached: true,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is not set. Please configure your .env file.",
      });
    }

    const originalText = await transcribeAudio(req.file.path);
    const summary = await summarizeText(originalText);

    saveSummary(messageId, originalText, summary);

    return res.json({ success: true, originalText, summary });
  } catch (err) {
    console.error("Error in /api/summarize:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error during processing.",
    });
  } finally {
    if (req.file) {
      await cleanupFile(req.file.path);
    }
  }
});

export default router;
export { upload };
