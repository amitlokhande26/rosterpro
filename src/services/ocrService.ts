import { createWorker } from 'tesseract.js';
import type { OcrExtractedData } from '@/lib/types';

const LINE_PATTERNS = [
  /bottling\s*line\s*(\d)/i,
  /canning\s*line\s*(\d)/i,
  /kegging\s*line/i,
];

const DATE_PATTERNS = [
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
  /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
];

const TIME_PATTERNS = [
  /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
  /(\d{1,2})\.(\d{2})\s*(am|pm)?/i,
];

const RUNTIME_PATTERNS = [
  /runtime[:\s]*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)?/i,
  /duration[:\s]*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)?/i,
  /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i,
];

function parseDate(match: RegExpMatchArray): string {
  if (match[0].includes('-') || match[0].includes('/')) {
    const parts = match[0].split(/[\/\-]/);
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return '';
}

function parseTime(match: RegExpMatchArray): string {
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();

  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractProductionLine(text: string): string {
  for (const pattern of LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      if (/kegging/i.test(match[0])) return 'Kegging Line';
      const type = /bottling/i.test(match[0]) ? 'Bottling' : 'Canning';
      return `${type} Line ${match[1]}`;
    }
  }
  return '';
}

function extractProductName(text: string): string {
  const productMatch = text.match(/product[:\s]+(.+?)(?:\n|start|runtime|duration|$)/i);
  if (productMatch) return productMatch[1].trim();

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/line|start|runtime|duration|date|time/i.test(line) && line.length > 3) {
      return line;
    }
  }
  return '';
}

export async function extractFromImage(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<OcrExtractedData> {
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(file);
    const text = data.text;
    const confidence = data.confidence;

    let production_line = extractProductionLine(text);
    let product_name = extractProductName(text);
    let start_date = '';
    let start_time = '';
    let runtime_hours = 0;

    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        start_date = parseDate(match);
        break;
      }
    }

    for (const pattern of TIME_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        start_time = parseTime(match);
        break;
      }
    }

    for (const pattern of RUNTIME_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        runtime_hours = parseFloat(match[1]);
        break;
      }
    }

    return {
      production_line,
      product_name,
      start_date,
      start_time,
      runtime_hours,
      raw_text: text,
      confidence,
    };
  } finally {
    await worker.terminate();
  }
}

export function validateImageFile(file: File): string | null {
  const isImage =
    file.type.startsWith('image/') ||
    file.type === '' ||
    /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
  if (!isImage) {
    return 'Only image files are supported (PNG, JPG, etc.)';
  }
  if (file.size > 10 * 1024 * 1024) {
    return 'File size must be less than 10MB';
  }
  return null;
}
