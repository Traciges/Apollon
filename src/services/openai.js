import OpenAI from "openai";
import fs from "fs";

const WHISPER_LANGUAGE = process.env.WHISPER_LANGUAGE || "de";

let openai = null;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function transcribeAudio(filePath) {
  const client = getOpenAI();
  const params = {
    file: fs.createReadStream(filePath),
    model: "whisper-1",
  };
  if (WHISPER_LANGUAGE && WHISPER_LANGUAGE.toLowerCase() !== "auto") {
    params.language = WHISPER_LANGUAGE;
  }
  const transcription = await client.audio.transcriptions.create(params);
  return transcription.text;
}

export async function summarizeText(originalText) {
  const client = getOpenAI();
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
      { role: "user", content: originalText },
    ],
  });
  return completion.choices[0].message.content;
}
