import * as XLSX from 'xlsx';
import { settingsService } from './settingsService';
import { parseOuterPackSize } from './quantityService';
import type { ProductionLine } from '@/lib/types';

export interface AiExtractedJob {
  production_line: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
  notes?: string;
  divider_required?: boolean;
  floater_required?: boolean;
  quantity_ordered?: number | null;
  outer_pack_label?: string | null;
  outer_pack_size?: number | null;
}

export interface AiScheduleResult {
  jobs: AiExtractedJob[];
  raw_response?: string;
}

const PROMPT = `You are a production schedule data extractor for a wine bottling and packaging facility.

Read the uploaded schedule (image, PDF, or spreadsheet data) and extract EVERY production job visible.

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
- divider_required: true if "Divider" is mentioned for this specific bottling line run (Bottling Line 1 or Bottling Line 2 only). Look for the word "Divider" in the row, product notes, or schedule comments for that run. false otherwise.
- floater_required: true only if "Floater" is explicitly mentioned for that run on a bottling line, false otherwise
- quantity_ordered: number of outer packs/cases ordered (or kegs for kegging — see below)
- outer_pack_label: pack size label such as "6PK", "12PK", "24PK" for bottling and canning lines; null for kegging
- outer_pack_size: numeric units per outer pack (e.g. 6 for 6PK); null for kegging

QUANTITY rules:
- Bottling Line 1, Bottling Line 2, Canning Line 1, Canning Line 2: quantity_ordered is the number of cases/outer packs. outer_pack_label is the pack format (6PK = 6 bottles/cans per case). Total units = quantity_ordered × pack size.
- Kegging Line (or any keg line): quantity_ordered IS the actual number of kegs. Set outer_pack_label and outer_pack_size to null — do NOT multiply by pack size.

IMPORTANT — Divider detection for bottling lines:
- On Bottling Line 1 and Bottling Line 2 schedules, if the word "Divider" appears anywhere associated with a production run, set divider_required to true for that job.
- This means an extra Divider staff member is needed for that shift.

Return ONLY valid JSON:
{
  "jobs": [
    {
      "production_line": "Bottling Line 1",
      "product_name": "Shiraz 750ml",
      "start_date": "2026-06-16",
      "start_time": "08:00",
      "runtime_hours": 8,
      "notes": "",
      "divider_required": true,
      "floater_required": false,
      "quantity_ordered": 500,
      "outer_pack_label": "6PK",
      "outer_pack_size": 6
    }
  ]
}

Extract ALL rows/jobs. Do not stop at one.`;

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeMatch = header.match(/data:(.*?);/);
      resolve({
        mimeType: mimeMatch?.[1] ?? file.type ?? 'application/octet-stream',
        data,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function excelToText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    return `=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`;
  }).join('\n\n');
}

function isBottlingLine(lineName: string): boolean {
  return /bottling line/i.test(lineName);
}

function detectDividerFromText(job: AiExtractedJob): boolean {
  if (job.divider_required) return true;
  if (!isBottlingLine(job.production_line)) return false;
  const blob = `${job.product_name} ${job.notes ?? ''}`.toLowerCase();
  return /\bdivider\b/.test(blob);
}

function parseAiResponse(content: string): AiScheduleResult {
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleaned) as { jobs?: AiExtractedJob[] };

  if (!parsed.jobs || !Array.isArray(parsed.jobs)) {
    throw new Error('AI response did not contain a jobs array');
  }

  const jobs = parsed.jobs
    .filter((j) => j.product_name?.trim())
    .map((j) => {
      const job: AiExtractedJob = {
        production_line: String(j.production_line ?? '').trim(),
        product_name: String(j.product_name).trim(),
        start_date: normalizeDate(String(j.start_date ?? '')),
        start_time: normalizeTime(String(j.start_time ?? '')),
        runtime_hours: Number(j.runtime_hours) || 0,
        notes: j.notes ? String(j.notes) : '',
        divider_required: detectDividerFromText({
          ...j,
          production_line: String(j.production_line ?? ''),
          product_name: String(j.product_name ?? ''),
        }),
        floater_required: Boolean(j.floater_required),
        quantity_ordered: parseQuantity(j.quantity_ordered),
        outer_pack_label: j.outer_pack_label ? String(j.outer_pack_label).trim() : null,
        outer_pack_size: j.outer_pack_size != null ? parseOuterPackSize(j.outer_pack_size) : null,
      };
      return job;
    })
    .filter((j) => j.runtime_hours > 0);

  if (jobs.length === 0) {
    throw new Error('No production jobs found in the file. Try a clearer photo or file.');
  }

  return { jobs, raw_response: content };
}

function parseQuantity(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return num > 0 ? num : null;
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

export function validateScheduleFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const isImage =
    file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(name);
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const isExcel =
    file.type.includes('spreadsheet') ||
    file.type.includes('excel') ||
    /\.(xlsx|xls|csv)$/i.test(name);

  if (!isImage && !isPdf && !isExcel) {
    return 'Supported files: images (PNG, JPG), PDF, Excel (.xlsx, .xls), or CSV';
  }
  if (file.size > 20 * 1024 * 1024) {
    return 'File size must be less than 20MB';
  }
  return null;
}

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.includes('spreadsheet') ||
    file.type.includes('excel') ||
    /\.(xlsx|xls|csv)$/i.test(name)
  );
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function buildGeminiParts(file: File, lineList: string): Promise<GeminiPart[]> {
  const instruction = `${PROMPT}\n\nExtract all production jobs from this schedule. Known lines: ${lineList}`;

  if (isExcelFile(file)) {
    const spreadsheetText = await excelToText(file);
    return [
      {
        text: `${instruction}\n\n--- SPREADSHEET DATA ---\n${spreadsheetText}`,
      },
    ];
  }

  const { mimeType, data } = await fileToBase64(file);
  const mediaType = isPdfFile(file) ? 'application/pdf' : mimeType;

  return [
    { text: instruction },
    { inline_data: { mime_type: mediaType, data } },
  ];
}

async function callGemini(parts: GeminiPart[], apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
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
  if (!content) throw new Error('Empty response from AI — try a clearer file');
  return content;
}

export async function extractScheduleWithAI(
  file: File,
  lines: ProductionLine[],
): Promise<AiScheduleResult> {
  const apiKey = settingsService.get().gemini_api_key;
  if (!apiKey) {
    throw new Error('Gemini API key not configured.');
  }

  const lineList = lines.map((l) => l.name).join(', ');
  const parts = await buildGeminiParts(file, lineList);
  const content = await callGemini(parts, apiKey);
  return parseAiResponse(content);
}

/** @deprecated use validateScheduleFile */
export function validateImageFile(file: File): string | null {
  return validateScheduleFile(file);
}
