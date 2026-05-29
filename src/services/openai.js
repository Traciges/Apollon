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

export async function summarizeText(originalText, senderName) {
  const client = getOpenAI();
  const name = typeof senderName === "string" ? senderName.trim() : "";

  const speakerInstruction = name
    ? `The voice message was sent by "${name}". When referring to the person ` +
      `speaking, use their name ("${name}") — never generic terms like ` +
      `"the speaker", "der Sprecher" or "die Sprecherin". `
    : `Refer to the person speaking naturally; avoid stiff generic terms ` +
      `like "the speaker" / "der Sprecher" where a more natural phrasing fits. `;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that summarizes voice messages. " +
          "Create a concise, easy-to-read summary of the following transcript. " +
          "ALWAYS reply in the same language as the voice message. " +
          speakerInstruction +
          "Use bullet points when it makes sense for the content (e.g. multiple points, tasks or topics); " +
          "for a single, short statement a brief paragraph is enough. " +
          "Output only the summary, without any introduction or meta commentary.",
      },
      { role: "user", content: originalText },
    ],
  });
  return completion.choices[0].message.content;
}
