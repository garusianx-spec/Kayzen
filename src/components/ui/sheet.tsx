'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet.
 *
 * Radix Dialog supplies the parts that are tedious and easy to get wrong — focus
 * trapping, `aria-modal`, escape handling, scroll locking — and Framer Motion
 * supplies the part users actually feel: the sheet rides up from the bottom and
 * can be flung back down.
 *
 * Dismissal threshold is velocity *or* distance, because a quick flick and a
 * slow deliberate drag are both "close this", and requiring distance alone makes
 * the sheet feel sticky.
 */

export interface SheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  /** Hides the visible title bar but keeps the accessible name. */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  children,
  footer,
  className,
}: SheetProps) {
  const haptics = useHapticFeedback();
  const reduceMotion = usePrefersReducedMotion();

  const handleDragEnd = (_event: unknown, info: PanInfo): void => {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) {
      haptics.impact('light');
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </Dialog.Overlay>

            <Dialog.Content
              asChild
              forceMount
              aria-describedby={description ? undefined : undefined}
            >
              <motion.div
                dir="rtl"
                className={cn(
                  'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-hidden rounded-t-sheet',
                  'border-t border-border bg-surface-raised pb-safe-bottom shadow-nav',
                  className,
                )}
                initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                drag={reduceMotion ? false : 'y'}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={handleDragEnd}
              >
                {/* Grab handle: the affordance that tells users the sheet drags. */}
                <div className="flex justify-center pb-1 pt-3">
                  <span aria-hidden className="h-1 w-10 rounded-pill bg-border-strong" />
                </div>

                <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-2">
                  {hideTitle ? (
                    <VisuallyHidden asChild>
                      <Dialog.Title>{title}</Dialog.Title>
                    </VisuallyHidden>
                  ) : (
                    <div className="min-w-0">
                      <Dialog.Title className="text-title-lg text-content-primary">
                        {title}
                      </Dialog.Title>
                      {description ? (
                        <Dialog.Description className="mt-1 text-caption text-content-muted">
                          {description}
                        </Dialog.Description>
                      ) : null}
                    </div>
                  )}

                  <Dialog.Close
                    className="kz-pressable -mt-1 rounded-full p-2 text-content-muted hover:bg-card hover:text-content-primary"
                    aria-label="بستن"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </Dialog.Close>
                </header>

                <div className="max-h-[70dvh] overflow-y-auto overscroll-contain px-5 pb-4">
                  {children}
                </div>

                {footer ? (
                  <div className="border-t border-border bg-surface-raised px-5 py-4">{footer}</div>
                ) : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
