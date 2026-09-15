import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-caption-sm font-medium',
  {
    variants: {
      tone: {
        violet: 'bg-violet-soft text-violet',
        flame: 'bg-flame-soft text-flame',
        emerald: 'bg-emerald-soft text-emerald',
        rose: 'bg-rose-soft text-rose',
        sky: 'bg-sky-soft text-sky',
        neutral: 'bg-surface-raised text-content-secondary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
