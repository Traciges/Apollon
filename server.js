import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Load .env
dotenv.config({ quiet: true });

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Create the upload folder if it does not exist yet
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// The OpenAI client is created lazily (the SDK throws on startup if no key is
// set  this way the server can still boot).
let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// --- Multer configuration (store uploads on disk in uploads/) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Unique filename to avoid collisions on parallel requests
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".ogg";
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB  Whisper limit
});

// --- Express app ---
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "apollon-backend" });
});

// --- Helper: safely delete the temporary file ---
async function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    // File may already be gone  just log it, don't affect the request
    if (err.code !== "ENOENT") {
      console.error(`Cleanup error for ${filePath}:`, err.message);
    }
  }
}

// --- Main endpoint: Audio -> Transcript -> Summary ---
app.post("/api/summarize", upload.single("audio"), async (req, res) => {
  try {
    // 1. Is a file present?
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No audio file uploaded. Expected field: 'audio'.",
      });
    }

    // 2. Is the API key set?
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is not set. Please configure your .env file.",
      });
    }

    // 3. Step A: Voice-to-text via Whisper
    const client = getOpenAI();
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "whisper-1",
    });
    const originalText = transcription.text;

    // 4. Step B: Summary via GPT-4o-mini
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that summarizes voice messages. " +
            "Create a concise, easy-to-read summary of the following transcript. " +
            "ALWAYS reply in the same language as the voice message. " +
            "Use bullet points when it makes sense for the content (e.g. multiple points, tasks or topics); " +
            "for a single, short statement a brief paragraph is enough. " +
            "Output only the summary, without any introduction or meta commentary.",
        },
        {
          role: "user",
          content: originalText,
        },
      ],
    });
    const summary = completion.choices[0].message.content;

    // 5. Successful response
    return res.json({
      success: true,
      originalText,
      summary,
    });
  } catch (err) {
    console.error("Error in /api/summarize:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error during processing.",
    });
  } finally {
    // 6. Cleanup: ALWAYS delete the temporary file (success or error)
    if (req.file) {
      await cleanupFile(req.file.path);
    }
  }
});

// --- Catch Multer errors (e.g. file too large) ---
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
  next();
});

// --- Start the server ---
app.listen(PORT, () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "WARNING: OPENAI_API_KEY is not set. Requests to /api/summarize will fail."
    );
  }
  console.log(`Apollon backend running at http://localhost:${PORT}`);
});
