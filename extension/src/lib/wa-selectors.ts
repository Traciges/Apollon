// WhatsApp-Web-spezifische Selektoren — zentral, da WhatsApp seine Markup-Klassen
// und data-icon-Namen häufig umbenennt. Wird sowohl von der UI (Anker-Erkennung)
// als auch von der MAIN-World-Brücke (Wiedergabe auslösen) genutzt.
//
// VERIFY ON BUILD: in den DevTools auf einer Sprachnachricht prüfen, ob diese
// data-icon-Namen noch passen.

// Sprachnachrichten (PTT) tragen ein "ptt-status"-Mikrofon-Icon — markiert eine
// Voice-Note zuverlässig und ist sprachunabhängig.
export const VOICE_MARKER = 'span[data-icon="ptt-status"]'

// Das Play-/Download-Control der Voice-Note. "media-play" wird mit Video geteilt,
// deshalb nur in Kombination mit dem VOICE_MARKER-Container verwenden.
export const PLAY_CONTROL_SELECTOR = [
  'span[data-icon="media-play"]',
  'span[data-icon="audio-download"]',
  'span[data-icon="audio-play"]',
  'span[data-icon="ptt-play"]'
].join(",")
