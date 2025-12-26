import { getEnv } from '../config/env.ts';

interface WhisperConfig {
  apiKey: string;
  model?: string;
  language?: string;
}

export class WhisperService {
  private apiKey: string;
  private model: string;
  private language: string;

  constructor(config?: Partial<WhisperConfig>) {
    const env = getEnv();
    this.apiKey = config?.apiKey || env.GROQ_API_KEY || '';
    this.model = config?.model || 'whisper-large-v3-turbo';
    this.language = config?.language || 'pl';
  }

  async transcribe(audioBuffer: ArrayBuffer, mimeType: string = 'audio/ogg'): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    const formData = new FormData();

    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', this.model);
    formData.append('language', this.language);
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');

    console.log(`[WhisperService] Transcribing audio (${audioBuffer.byteLength} bytes)`);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq Whisper API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { text: string };
    console.log(`[WhisperService] Transcription: "${data.text}"`);

    return data.text;
  }

  // Normalize Polish transcription
  normalizePolishText(transcription: string): string {
    const polishNumbers: Record<string, string> = {
      'jeden': '1', 'dwa': '2', 'trzy': '3', 'cztery': '4', 'piec': '5',
      'szesc': '6', 'siedem': '7', 'osiem': '8', 'dziewiec': '9',
      'dziesiec': '10', 'jedenascie': '11', 'dwanascie': '12',
      'trzynascie': '13', 'czternascie': '14', 'pietnascie': '15',
      'szesnascie': '16', 'siedemnascie': '17', 'osiemnascie': '18',
      'dziewietnascie': '19', 'dwadziescia': '20', 'trzydziesci': '30',
      'czterdziesci': '40', 'piecdziesiat': '50', 'szescdziesiat': '60',
      'siedemdziesiat': '70', 'osiemdziesiat': '80', 'dziewiecdziesiat': '90',
      'sto': '100', 'dwiescie': '200', 'trzysta': '300',
    };

    const fillers = ['eee', 'hmm', 'no to', 'no', 'tam', 'yyy', 'eh', 'uhm', 'znaczy'];
    const currency = ['zlotych', 'zloty', 'zlote', 'zl', 'pln'];

    let normalized = transcription.toLowerCase();

    // Remove filler words
    for (const filler of fillers) {
      normalized = normalized.replace(new RegExp(`\\b${filler}\\b`, 'gi'), ' ');
    }

    // Remove currency words
    for (const curr of currency) {
      normalized = normalized.replace(new RegExp(`\\b${curr}\\b`, 'gi'), ' ');
    }

    // Replace Polish numbers with digits
    for (const [polish, digit] of Object.entries(polishNumbers)) {
      normalized = normalized.replace(new RegExp(`\\b${polish}\\b`, 'gi'), digit);
    }

    // Clean up whitespace
    return normalized.replace(/\s+/g, ' ').trim();
  }

  // Detect intent from transcription
  detectIntent(text: string): 'expense' | 'query' | 'correction' | 'unknown' {
    const lower = text.toLowerCase();

    // Query patterns
    if (/^(ile|pokaz|raport|suma|ostatnie|lista)\b/.test(lower)) {
      return 'query';
    }

    // Correction patterns
    if (/^(zmien|popraw|kategoria)\b/.test(lower)) {
      return 'correction';
    }

    // If it looks like "shop amount" pattern, it's likely an expense
    if (/\d+/.test(lower)) {
      return 'expense';
    }

    return 'unknown';
  }
}
