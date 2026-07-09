import * as XLSX from 'xlsx';
import { settingsService } from './settingsService';
import { parseOuterPackSize, detectPackFromText, normalizePackLabel } from './quantityService';
import { detectFloaterRequired, parseClosureInputFromAiJob } from './closureService';
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
  closure?: string | null;
  closure_middle?: string | null;
  closure_final?: string | null;
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
- Bottling Line 1 (also BOTLINE1, BOT LINE 1)
- Bottling Line 2 (also BOTLINE2, BOT LINE 2, "1MOOR / BOTLINE2")
- Canning Line 1
- Canning Line 2
- Kegging Line

CRITICAL — extract EVERY row in the schedule table as a separate job. Do not merge rows.

For each job extract:
- production_line: exact line name from the list above (best match)
- product_name: wine/product being run
- start_date: YYYY-MM-DD format
- start_time: HH:mm 24-hour format
- runtime_hours: decimal number of hours
- notes: any extra info, or empty string
- divider_required: true if "Divider" is mentioned for this specific bottling line run (Bottling Line 1 or Bottling Line 2 only). Look for the word "Divider" in the row, product notes, or schedule comments for that run. false otherwise.
- closure: value from "Closure" column for bottling runs (e.g. CORKSPKAGGLPM for corks). Empty string if not applicable.
- closure_middle: value from "Closure Middle" column (e.g. MUSPLAINSILVER for muslets). Empty string if not applicable.
- closure_final: value from "Closure Final" column (e.g. HOODGOLDUV for hoods). Empty string if not applicable.
- floater_required: for Bottling Line 1 and Bottling Line 2 ONLY — set true when ALL THREE closure types are present for that run: a cork code (starts with CORK), a muslet code (starts with MUS), and a hood code (starts with HOOD). These may appear in Closure / Closure Middle / Closure Final columns. If any one is missing, set false.
- quantity_ordered: number of outer packs/cases ordered (or kegs for kegging — see below)
- outer_pack_label: pack size label such as "6PK", "12PK", "24PK", "30PK" for bottling and canning lines; null for kegging
- outer_pack_size: numeric units per outer pack (e.g. 6 for 6PK); null for kegging

QUANTITY rules:
- Bottling Line 1, Bottling Line 2, Canning Line 1, Canning Line 2: quantity_ordered is the number of cases/outer packs. outer_pack_label is the pack format (6PK = 6 bottles/cans per case). Total units = quantity_ordered × pack size.
- Kegging Line (or any keg line): quantity_ordered IS the actual number of kegs. Set outer_pack_label and outer_pack_size to null — do NOT multiply by pack size.

IMPORTANT — Divider detection for bottling lines:
- On Bottling Line 1 and Bottling Line 2 schedules, if the word "Divider" appears anywhere associated with a production run, set divider_required to true for that job.
- This means an extra Divider staff member is needed for that shift.

IMPORTANT — Floater detection for bottling lines (closure columns):
- Schedules often have columns: Closure, Closure Middle, Closure Final.
- Cork codes start with CORK (example: CORKSPKAGGLOM). CROWN codes are NOT cork — do not count CROWNSPKPRINT as cork.
- Muslet codes start with MUS (example: MUSPLAINSILVER, MUSPLAINGOLD).
- Hood codes start with HOOD (example: HOODGOLDUV, HOODSILVERUV).
- NA or N/A in a closure column means that closure type is missing for that row.
- For EACH row, copy the exact values from Closure, Closure Middle, and Closure Final into closure, closure_middle, closure_final fields.
- floater_required is true ONLY when all three types are present for that bottling row (cork + muslet + hood). Rows with only cork + muslet but no hood = false.

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
      "floater_required": true,
      "closure": "CORKSPKAGGLPM",
      "closure_middle": "MUSPLAINSILVER",
      "closure_final": "HOODGOLDUV",
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

function resolvePackFields(j: AiExtractedJob): {
  outer_pack_label: string | null;
  outer_pack_size: number | null;
} {
  let label = normalizePackLabel(
    j.outer_pack_label ? String(j.outer_pack_label) : null,
  );
  let size =
    j.outer_pack_size != null ? parseOuterPackSize(j.outer_pack_size) : null;

  if (!label) {
    const detected = detectPackFromText(`${j.product_name ?? ''} ${j.notes ?? ''}`);
    if (detected) {
      label = detected.label;
      size = detected.size;
    }
  } else if (size == null) {
    size = parseOuterPackSize(label);
  }

  return { outer_pack_label: label, outer_pack_size: size };
}

function detectFloaterFromClosures(
  productionLine: string,
  raw: Record<string, unknown>,
): boolean {
  return detectFloaterRequired(productionLine, parseClosureInputFromAiJob(raw));
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
      const raw = j as unknown as Record<string, unknown>;
      const closureInput = parseClosureInputFromAiJob(raw);
      const job: AiExtractedJob = {
        production_line: String(j.production_line ?? '').trim(),
        product_name: String(j.product_name).trim(),
        start_date: normalizeDate(String(j.start_date ?? '')),
        start_time: normalizeTime(String(j.start_time ?? '')),
        runtime_hours: Number(j.runtime_hours) || 0,
        notes: closureInput.notes ?? '',
        divider_required: detectDividerFromText({
          ...j,
          production_line: String(j.production_line ?? ''),
          product_name: String(j.product_name ?? ''),
        }),
        floater_required: detectFloaterFromClosures(String(j.production_line ?? ''), raw),
        closure: closureInput.closure,
        closure_middle: closureInput.closure_middle,
        closure_final: closureInput.closure_final,
        quantity_ordered: parseQuantity(j.quantity_ordered),
        ...resolvePackFields({
          ...j,
          production_line: String(j.production_line ?? ''),
          product_name: String(j.product_name ?? ''),
        }),
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
  const compact = detected.toLowerCase().replace(/\s+/g, '');
  const botlineMatch = compact.match(/botline([12])/);
  if (botlineMatch) {
    const target = `bottling line ${botlineMatch[1]}`;
    const matched = lines.find((l) => l.name.toLowerCase() === target);
    if (matched) return matched;
  }

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

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
] as const;

const RETRY_DELAYS_MS = [2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCapacityError(message: string, status: number): boolean {
  const lower = message.toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    lower.includes('high demand') ||
    lower.includes('resource_exhausted') ||
    lower.includes('overloaded') ||
    lower.includes('try again') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  );
}

function isFatalGeminiError(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

async function callGeminiModel(
  model: string,
  parts: GeminiPart[],
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from AI — try a clearer file');
  return content;
}

async function callGeminiWithFallback(
  parts: GeminiPart[],
  apiKey: string,
  onStatus?: (message: string) => void,
): Promise<string> {
  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        if (attempt > 0) {
          onStatus?.(`Busy — retrying with ${model}...`);
          await sleep(RETRY_DELAYS_MS[attempt - 1]);
        } else if (model !== GEMINI_MODELS[0]) {
          onStatus?.(`Trying ${model}...`);
        }

        return await callGeminiModel(model, parts, apiKey);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown AI error';
        const status = (err as Error & { status?: number }).status ?? 0;
        errors.push(`${model}: ${message}`);

        if (isFatalGeminiError(status)) {
          throw new Error(message);
        }

        if (!isCapacityError(message, status)) {
          throw new Error(message);
        }

        if (attempt < RETRY_DELAYS_MS.length) {
          onStatus?.('AI servers busy — waiting a moment...');
          continue;
        }
      }
    }
  }

  throw new Error(
    'Gemini is temporarily overloaded. This is not caused by your Google Pro subscription — ' +
      'the API uses a separate quota from Google AI Studio. Wait 1–2 minutes and try again, ' +
      'or import during off-peak hours. We already tried multiple models automatically.',
  );
}

export async function extractScheduleWithAI(
  file: File,
  lines: ProductionLine[],
  onStatus?: (message: string) => void,
): Promise<AiScheduleResult> {
  const apiKey = settingsService.get().gemini_api_key;
  if (!apiKey) {
    throw new Error('Gemini API key not configured.');
  }

  const lineList = lines.map((l) => l.name).join(', ');
  const parts = await buildGeminiParts(file, lineList);
  const content = await callGeminiWithFallback(parts, apiKey, onStatus);
  return parseAiResponse(content);
}

/** @deprecated use validateScheduleFile */
export function validateImageFile(file: File): string | null {
  return validateScheduleFile(file);
}
