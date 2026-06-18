/** Quantity logic: bottling/canning vs kegging */

export function isKeggingLine(lineName: string): boolean {
  return /kegging|keg\s*line/i.test(lineName);
}

export function isPackBasedLine(lineName: string): boolean {
  return /bottling|canning/i.test(lineName);
}

/** Parse "6PK", "12 PK", or plain number into pack size */
export function parseOuterPackSize(labelOrNumber: string | number | null | undefined): number {
  if (typeof labelOrNumber === 'number' && labelOrNumber > 0) return labelOrNumber;
  if (labelOrNumber == null || labelOrNumber === '') return 1;
  const str = String(labelOrNumber).trim().toUpperCase();
  const pkMatch = str.match(/(\d+)\s*PK/);
  if (pkMatch) return parseInt(pkMatch[1], 10);
  const num = parseInt(str, 10);
  return num > 0 ? num : 1;
}

export function calculateTotalQuantity(
  lineName: string,
  quantityOrdered: number | null | undefined,
  outerPackSize: number | null | undefined,
): number | null {
  if (quantityOrdered == null || quantityOrdered <= 0) return null;

  if (isKeggingLine(lineName)) {
    return quantityOrdered;
  }

  if (isPackBasedLine(lineName)) {
    const packSize = outerPackSize && outerPackSize > 0 ? outerPackSize : 1;
    return quantityOrdered * packSize;
  }

  return quantityOrdered;
}

export interface QuantityFields {
  quantity_ordered: number | null;
  outer_pack_size: number | null;
  outer_pack_label: string | null;
  total_quantity: number | null;
}

export function resolveJobQuantities(
  lineName: string,
  input: {
    quantity_ordered?: number | null;
    outer_pack_size?: number | null;
    outer_pack_label?: string | null;
  },
): QuantityFields {
  const quantity_ordered =
    input.quantity_ordered != null && input.quantity_ordered > 0
      ? input.quantity_ordered
      : null;

  if (isKeggingLine(lineName)) {
    return {
      quantity_ordered,
      outer_pack_size: null,
      outer_pack_label: null,
      total_quantity: calculateTotalQuantity(lineName, quantity_ordered, null),
    };
  }

  const packSize = parseOuterPackSize(
    input.outer_pack_size ?? input.outer_pack_label ?? 1,
  );
  const outer_pack_label = input.outer_pack_label?.trim() || (packSize > 1 ? `${packSize}PK` : null);

  return {
    quantity_ordered,
    outer_pack_size: isPackBasedLine(lineName) ? packSize : null,
    outer_pack_label: isPackBasedLine(lineName) ? outer_pack_label : null,
    total_quantity: calculateTotalQuantity(lineName, quantity_ordered, packSize),
  };
}

export function formatQuantityDisplay(
  lineName: string,
  job: {
    quantity_ordered?: number | null;
    outer_pack_size?: number | null;
    total_quantity?: number | null;
  },
): string {
  const total = job.total_quantity ?? null;
  const ordered = job.quantity_ordered ?? null;
  const packSize = job.outer_pack_size ?? null;
  if (total == null) return '—';
  if (isKeggingLine(lineName)) {
    return `${total.toLocaleString()} kegs`;
  }
  const unit = /canning/i.test(lineName) ? 'cans' : 'bottles';
  if (ordered && packSize && packSize > 1) {
    return `${ordered.toLocaleString()} × ${packSize}PK = ${total.toLocaleString()} ${unit}`;
  }
  return `${total.toLocaleString()} ${unit}`;
}

export const PACK_SIZE_OPTIONS = ['1PK', '4PK', '6PK', '12PK', '24PK', '30PK'] as const;

/** Detect pack size from text such as product name, notes, or "30PK" in schedule */
export function detectPackFromText(text: string): { label: string; size: number } | null {
  const match = text.match(/\b(\d+)\s*PK\b/i);
  if (!match) return null;
  const size = parseInt(match[1], 10);
  if (size <= 0) return null;
  return { label: `${size}PK`, size };
}

export function normalizePackLabel(label: string | null | undefined): string | null {
  if (!label?.trim()) return null;
  const trimmed = label.trim().toUpperCase();
  const detected = detectPackFromText(trimmed);
  return detected?.label ?? trimmed;
}

/** Common pack sizes plus any value already on the job (e.g. AI-extracted 30PK) */
export function packOptionsForSelect(currentLabel?: string | null): string[] {
  const options = new Set<string>(PACK_SIZE_OPTIONS);
  const normalized = normalizePackLabel(currentLabel);
  if (normalized) options.add(normalized);
  return Array.from(options).sort(
    (a, b) => parseOuterPackSize(a) - parseOuterPackSize(b),
  );
}
