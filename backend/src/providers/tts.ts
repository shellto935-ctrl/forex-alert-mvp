/**
 * Generate a spoken audio file from Bengali text using Google Translate TTS.
 * Free, no API key needed. Returns MP3 audio buffer.
 */
export async function textToSpeechBengali(text: string): Promise<Buffer> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=bn&client=tw-ob&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`Google TTS failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
