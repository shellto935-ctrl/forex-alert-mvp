/**
 * Generate a spoken audio file from Bengali text using Edge TTS (Microsoft).
 * Uses the free Microsoft Edge TTS service — no API key needed.
 * Returns the audio buffer as a Buffer.
 */
export async function textToSpeechBengali(text: string): Promise<Buffer> {
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='bn-IN'><voice name='bn-IN-PradeepNeural'><prosody rate='-5%'>${escapeXml(text)}</prosody></voice></speak>`;

  const response = await fetch(
    'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: ssml,
      signal: AbortSignal.timeout(30_000)
    }
  );

  if (!response.ok) {
    throw new Error(`Edge TTS failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
