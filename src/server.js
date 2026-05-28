import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import summarizeRouter from "./routes/summarize.js";
import "./db/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

const PORT = process.env.PORT || 3000;
const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || "de";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://web.whatsapp.com";

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "apollon-backend" });
});

app.use("/api", summarizeRouter);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res
      .status(400)
      .json({ success: false, error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "WARNING: OPENAI_API_KEY is not set. Requests to /api/summarize will fail."
    );
  }
  console.log(`Apollon backend running at http://localhost:${PORT}`);
  console.log(`   - Allowed CORS origin: ${ALLOWED_ORIGIN}`);
  console.log(`   - Whisper language: ${WHISPER_LANGUAGE}`);
});
