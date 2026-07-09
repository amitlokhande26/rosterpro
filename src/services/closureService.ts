/** Floater detection from bottling closure columns */

export interface ClosureInput {
  product_name?: string;
  notes?: string;
  closure?: string | null;
  closure_middle?: string | null;
  closure_final?: string | null;
}

export function normalizeClosureValue(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === 'NA' || upper === 'N/A' || upper === '-' || upper === 'NONE') return null;
  return trimmed;
}

function pickClosureField(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = normalizeClosureValue(raw[key]);
    if (val) return val;
  }
  return null;
}

/** Build closure input from AI job row, including all string fields as fallback */
export function parseClosureInputFromAiJob(raw: Record<string, unknown>): ClosureInput {
  const closure = pickClosureField(raw, 'closure', 'Closure');
  const closure_middle = pickClosureField(
    raw,
    'closure_middle',
    'closureMiddle',
    'closure_middle_type',
    'Closure Middle',
  );
  const closure_final = pickClosureField(
    raw,
    'closure_final',
    'closureFinal',
    'closure_final_type',
    'Closure Final',
  );

  const product_name = String(raw.product_name ?? '');
  let notes = raw.notes ? String(raw.notes) : '';

  const extras: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const str = String(value).trim();
    if (!str) continue;
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('closure') ||
      keyLower.includes('middle') ||
      keyLower.includes('final') ||
      /^(CORK|MUS|HOOD|CROWN)[A-Z0-9]/i.test(str)
    ) {
      if (!extras.includes(str)) extras.push(str);
    }
  }

  const rowBlob = Object.values(raw)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter((s) => s.length > 0 && s.length <= 80)
    .join(' ');

  notes = [notes, ...extras, rowBlob].filter(Boolean).join(' ');

  return { product_name, notes, closure, closure_middle, closure_final };
}

export function buildClosureSearchText(input: ClosureInput): string {
  return [
    input.product_name,
    input.notes,
    input.closure,
    input.closure_middle,
    input.closure_final,
  ]
    .filter((value) => value != null && String(value).trim() !== '')
    .join(' ');
}

/** Cork closure codes e.g. CORKSPKAGGLOM — not CROWN caps */
export function hasCorkClosure(text: string): boolean {
  return /\bCORK[A-Z0-9]*/i.test(text);
}

/** Muslet closure codes e.g. MUSPLAINSILVER */
export function hasMusletClosure(text: string): boolean {
  return /\bMUS[A-Z0-9]*/i.test(text);
}

/** Hood closure codes e.g. HOODGOLDUV */
export function hasHoodClosure(text: string): boolean {
  return /\bHOOD[A-Z0-9]*/i.test(text);
}

export function isBottlingLineName(lineName: string): boolean {
  return /bottling line|botline/i.test(lineName);
}

/** Floater needed when cork + muslet + hood closures are all present */
export function detectFloaterRequired(lineName: string, input: ClosureInput): boolean {
  if (!isBottlingLineName(lineName)) return false;

  const cork = normalizeClosureValue(input.closure);
  const middle = normalizeClosureValue(input.closure_middle);
  const hood = normalizeClosureValue(input.closure_final);

  if (cork && middle && hood) {
    return (
      hasCorkClosure(cork) &&
      hasMusletClosure(middle) &&
      hasHoodClosure(hood)
    );
  }

  const text = buildClosureSearchText(input);
  if (!text.trim()) return false;
  return (
    hasCorkClosure(text) &&
    hasMusletClosure(text) &&
    hasHoodClosure(text)
  );
}

export function describeFloaterDetection(input: ClosureInput): string {
  const text = buildClosureSearchText(input);
  const parts: string[] = [];
  if (hasCorkClosure(text)) parts.push('cork');
  if (hasMusletClosure(text)) parts.push('muslet');
  if (hasHoodClosure(text)) parts.push('hood');
  if (parts.length === 0) return 'No closure codes detected';
  if (parts.length === 3) return 'Cork + muslet + hood — floater required';
  return `Found: ${parts.join(', ')} — floater not required`;
}
