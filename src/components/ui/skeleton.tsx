import { cn } from '@/lib/utils';

/** Placeholder block. Sized by the caller so the layout does not jump on load. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('kz-skeleton', className)} />;
}
