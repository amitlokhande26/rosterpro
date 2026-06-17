import { settingsService } from './settingsService';
import type { ProductionLine } from '@/lib/types';

export interface AiExtractedJob {
  production_line: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
  notes?: string;
}

export interface AiScheduleResult {
  jobs: AiExtractedJob[];
  raw_response?: string;
}

const PROMPT = `You are a production schedule data extractor for a wine bottling and packaging facility.

Read the uploaded schedule image and extract EVERY production job visible — there may be multiple lines and products in one image.

Valid production line names (match as closely as possible):
- Bottling Line 1
- Bottling Line 2
- Canning Line 1
- Canning Line 2
- Kegging Line

For each job extract:
- production_line: exact line name from the list above (best match)
- product_name: wine/product being run
- start_date: YYYY-MM-DD format
- start_time: HH:mm 24-hour format
- runtime_hours: decimal number of hours
- notes: any extra info, or empty string

Return ONLY valid JSON in this exact shape:
{
  "jobs": [
    {
      "production_line": "Bottling Line 1",
      "product_name": "Shiraz 750ml",
      "start_date": "2026-06-16",
      "start_time": "08:00",
      "runtime_hours": 8,
      "notes": ""
    }
  ]
}

If a field is unclear, make your best guess from context. Extract ALL rows/jobs from the schedule — do not stop at one.`;

async function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeMatch = header.match(/data:(.*?);/);
      resolve({
        mimeType: mimeMatch?.[1] ?? file.type ?? 'image/jpeg',
        data,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseAiResponse(content: string): AiScheduleResult {
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned) as { jobs?: AiExtractedJob[] };

  if (!parsed.jobs || !Array.isArray(parsed.jobs)) {
    throw new Error('AI response did not contain a jobs array');
  }

  const jobs = parsed.jobs
    .filter((j) => j.product_name?.trim())
    .map((j) => ({
      production_line: String(j.production_line ?? '').trim(),
      product_name: String(j.product_name).trim(),
      start_date: normalizeDate(String(j.start_date ?? '')),
      start_time: normalizeTime(String(j.start_time ?? '')),
      runtime_hours: Number(j.runtime_hours) || 0,
      notes: j.notes ? String(j.notes) : '',
    }))
    .filter((j) => j.runtime_hours > 0);

  if (jobs.length === 0) {
    throw new Error('No production jobs found in the image. Try a clearer photo.');
  }

  return { jobs, raw_response: content };
}

function normalizeDate(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const dmy = date.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return date;
}

function normalizeTime(time: string): string {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  const ampm = time.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    if (ampm[3].toLowerCase() === 'pm' && h < 12) h += 12;
    if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  return time;
}

export function matchLineName(
  detected: string,
  lines: ProductionLine[],
): ProductionLine | undefined {
  if (!detected) return undefined;
  const lower = detected.toLowerCase();
  return (
    lines.find((l) => l.name.toLowerCase() === lower) ??
    lines.find((l) => lower.includes(l.name.toLowerCase())) ??
    lines.find((l) => l.name.toLowerCase().includes(lower))
  );
}

export async function extractScheduleWithAI(
  file: File,
  lines: ProductionLine[],
): Promise<AiScheduleResult> {
  const apiKey = settingsService.get().gemini_api_key;
  if (!apiKey) {
    throw new Error(
      'Free Gemini API key not configured. Go to Administration → AI Settings and add your key from Google AI Studio.',
    );
  }

  const { mimeType, data } = await fileToBase64(file);
  const lineList = lines.map((l) => l.name).join(', ');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT}\n\nExtract all production jobs from this schedule. Known lines: ${lineList}`,
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message =
      (err as { error?: { message?: string } })?.error?.message ??
      `AI request failed (${response.status})`;
    throw new Error(message);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from AI — try a clearer photo');

  return parseAiResponse(content);
}
