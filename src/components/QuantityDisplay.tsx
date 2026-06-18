import { isKeggingLine } from '@/services/quantityService';

interface QuantityDisplayProps {
  lineName: string;
  job: {
    quantity_ordered?: number | null;
    outer_pack_size?: number | null;
    total_quantity?: number | null;
  };
  className?: string;
}

export function QuantityDisplay({ lineName, job, className }: QuantityDisplayProps) {
  const total = job.total_quantity ?? null;
  const ordered = job.quantity_ordered ?? null;
  const packSize = job.outer_pack_size ?? null;

  if (total == null) {
    return <span className={className}>—</span>;
  }

  if (isKeggingLine(lineName)) {
    return (
      <span className={className}>
        <strong>{total.toLocaleString()} kegs</strong>
      </span>
    );
  }

  const unit = /canning/i.test(lineName) ? 'cans' : 'bottles';

  if (ordered && packSize && packSize > 1) {
    return (
      <span className={className}>
        {ordered.toLocaleString()} × {packSize}PK ={' '}
        <strong>
          {total.toLocaleString()} {unit}
        </strong>
      </span>
    );
  }

  return (
    <span className={className}>
      <strong>
        {total.toLocaleString()} {unit}
      </strong>
    </span>
  );
}
