/** Floater detection from bottling closure columns */

export interface ClosureInput {
  product_name?: string;
  notes?: string;
  closure?: string | null;
  closure_middle?: string | null;
  closure_final?: string | null;
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

/** Cork closure codes e.g. CORKSPKAGGLPM */
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
  return /bottling line/i.test(lineName);
}

/** Floater needed when cork + muslet + hood closures are all present */
export function detectFloaterRequired(lineName: string, input: ClosureInput): boolean {
  if (!isBottlingLineName(lineName)) return false;
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
