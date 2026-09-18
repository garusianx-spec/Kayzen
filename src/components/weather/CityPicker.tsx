'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { toPersianDigits } from '@/lib/date/digits';
import { PROVINCES, searchCities, type Province } from '@/lib/domain/iran-geo';
import { cn } from '@/lib/utils';

/**
 * استان ← شهر — the two-step city picker.
 *
 * A drill-down rather than one flat list of 134 cities, because the flat list
 * is only useful to somebody who already knows how to spell their town: the
 * province is the thing everybody knows, and it cuts the choice to a handful.
 *
 * Search sits above both levels and short-circuits them, because a drill-down
 * is the wrong shape for somebody who does know. It matches province names too,
 * so typing «گیلان» offers every city in it.
 */

export interface CityPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  selectedCityId: string;
  onSelect(cityId: string): void;
}

export function CityPicker({ open, onOpenChange, selectedCityId, onSelect }: CityPickerProps) {
  const [province, setProvince] = useState<Province | null>(null);
  const [query, setQuery] = useState('');

  const haptics = useHapticFeedback();
  const reduceMotion = useReducedMotion();

  // Reopening lands back at the province list rather than wherever the last
  // visit left off; "where am I" should never be a question a picker raises.
  useEffect(() => {
    if (!open) return;
    setProvince(null);
    setQuery('');
  }, [open]);

  const matches = searchCities(query);
  const searching = query.trim().length > 0;

  const choose = (cityId: string): void => {
    haptics.impact('light');
    onSelect(cityId);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={province && !searching ? province.name : 'کدام شهر؟'}
      description={
        province && !searching
          ? toPersianDigits(`${province.cities.length} شهر`)
          : toPersianDigits(`${PROVINCES.length} استان`)
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-content-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی شهر یا استان…"
            className="ps-10"
            enterKeyHint="search"
            aria-label="جست‌وجوی شهر"
          />
        </div>

        {province && !searching ? (
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setProvince(null);
            }}
            className="kz-pressable flex min-h-[44px] items-center gap-1.5 text-caption text-violet active:scale-95"
          >
            {/* RTL: "back" points right, which `ChevronLeft` mirrored is not —
                so the glyph that reads as backwards here is the left one. */}
            <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden />
            همهٔ استان‌ها
          </button>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={searching ? 'search' : (province?.id ?? 'provinces')}
            initial={reduceMotion ? false : { opacity: 0, x: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          >
            {searching ? (
              matches.length === 0 ? (
                <p className="rounded-card border border-dashed border-border p-6 text-center text-caption text-content-muted">
                  شهری با این نام پیدا نشد. شاید املای دیگری دارد؟
                </p>
              ) : (
                <ul className="space-y-1">
                  {matches.map((match) => (
                    <li key={match.city.id}>
                      <Row
                        label={match.city.name}
                        hint={match.province.name}
                        selected={match.city.id === selectedCityId}
                        onClick={() => choose(match.city.id)}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : province ? (
              <ul className="space-y-1">
                {province.cities.map((city, index) => (
                  <li key={city.id}>
                    <Row
                      label={city.name}
                      // The capital is the one people mean when they pick the
                      // province and then hesitate.
                      hint={index === 0 ? 'مرکز استان' : undefined}
                      selected={city.id === selectedCityId}
                      onClick={() => choose(city.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1">
                {PROVINCES.map((entry) => (
                  <li key={entry.id}>
                    <Row
                      label={entry.name}
                      hint={toPersianDigits(`${entry.cities.length} شهر`)}
                      chevron
                      onClick={() => {
                        haptics.selection();
                        setProvince(entry);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function Row({
  label,
  hint,
  selected = false,
  chevron = false,
  onClick,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  chevron?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'kz-pressable flex min-h-[48px] w-full items-center gap-2 rounded-card px-3 text-start transition-colors active:scale-[0.98]',
        selected ? 'bg-violet-soft text-violet' : 'text-content-secondary hover:bg-surface-raised',
      )}
    >
      {selected ? <MapPin className="h-4 w-4 shrink-0" aria-hidden /> : null}

      <span className="min-w-0 flex-1 truncate text-caption">{label}</span>

      {hint ? <span className="shrink-0 text-caption-sm text-content-muted">{hint}</span> : null}
      {chevron ? <ChevronLeft className="h-4 w-4 shrink-0 text-content-muted" aria-hidden /> : null}
    </button>
  );
}
