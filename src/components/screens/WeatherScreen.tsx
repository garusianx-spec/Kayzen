'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Droplets, MapPin, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CityPicker } from '@/components/weather/CityPicker';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/date/digits';
import { JALALI_WEEKDAYS } from '@/lib/date/jalali';
import { DEFAULT_CITY_ID, findCity } from '@/lib/domain/iran-geo';
import { cn } from '@/lib/utils';
import type { DailyWeatherDto, ForecastDto } from '@/types/domain';

/**
 * هوای شهر — the provincial weather tool.
 *
 * Three readings, in the order somebody actually asks them: what is it like
 * right now, what will the next few hours do, and is the weekend any good.
 *
 * The chosen city lives in `localStorage` rather than on the account, and that
 * is deliberate: a weather city is about where you *are*, not who you are.
 * Somebody who travels to شیراز for a week wants شیراز on the phone in their
 * pocket without changing a setting that would follow them home. The cost is
 * that a second device starts at تهران, which is one tap to fix.
 */

const STORAGE_KEY = 'kayzen:weather-city';

/** Temperatures are integers and Persian digits everywhere; `۲۸°` not `28°`. */
const degrees = (value: number): string => `${toPersianDigits(Math.round(value))}°`;

function readStoredCity(): string {
  // Private windows, cleared site data and blocked storage all throw rather
  // than returning null, and a weather screen is not worth a blank page.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && findCity(stored) ? stored : DEFAULT_CITY_ID;
  } catch {
    return DEFAULT_CITY_ID;
  }
}

export function WeatherScreen() {
  // Starts at the default so the server and the first client render agree; the
  // stored city arrives in an effect, which is a repaint rather than a
  // hydration mismatch.
  const [cityId, setCityId] = useState(DEFAULT_CITY_ID);
  const [picking, setPicking] = useState(false);
  const haptics = useHapticFeedback();

  useEffect(() => {
    setCityId(readStoredCity());
  }, []);

  const choose = (next: string): void => {
    setCityId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage is a convenience here, not the source of truth. A reader in a
      // private window simply starts at تهران next time.
    }
  };

  const forecast = useQuery({
    queryKey: ['weather', cityId],
    queryFn: async () => {
      const result = await api.get<{ forecast: ForecastDto }>(`/tools/weather?city=${cityId}`);
      return result.forecast;
    },
    // The upstream is cached for fifteen minutes; refetching faster than that
    // would spend requests to receive the same numbers.
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const place = findCity(cityId);
  const data = forecast.data;

  return (
    <div className="space-y-5 px-4 pt-4">
      <header className="space-y-1">
        <h1 className="text-display text-content-primary">هوای شهر</h1>
        <p className="text-caption text-content-muted">
          استان را انتخاب کن، بعد شهر — بقیه‌اش با ما.
        </p>
      </header>

      <button
        type="button"
        onClick={() => {
          haptics.selection();
          setPicking(true);
        }}
        className="kz-pressable flex min-h-[56px] w-full items-center gap-2 rounded-card border border-border bg-card px-4 text-start active:scale-[0.98]"
      >
        <MapPin className="h-5 w-5 shrink-0 text-violet" aria-hidden />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-title text-content-primary">
            {place?.city.name ?? '—'}
          </span>
          <span className="block truncate text-caption-sm text-content-muted">
            استان {place?.province.name ?? '—'}
          </span>
        </span>

        <ChevronDown className="h-4 w-4 shrink-0 text-content-muted" aria-hidden />
      </button>

      {forecast.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : forecast.isError || !data ? (
        <ErrorCard onRetry={() => void forecast.refetch()} isRetrying={forecast.isFetching} />
      ) : (
        <>
          <CurrentCard forecast={data} />
          <HourlyStrip forecast={data} />
          <DailyList days={data.daily} />

          <p className="text-center text-caption-sm text-content-muted">
            داده‌ها از Open-Meteo · هر ربع ساعت تازه می‌شود
          </p>
        </>
      )}

      <CityPicker
        open={picking}
        onOpenChange={setPicking}
        selectedCityId={cityId}
        onSelect={choose}
      />
    </div>
  );
}

function CurrentCard({ forecast }: { forecast: ForecastDto }) {
  const { current } = forecast;

  return (
    <section className="kz-card space-y-4" aria-label={`هوای ${forecast.city.name}`}>
      <div className="flex items-center gap-4">
        <WeatherIcon look={current} className="h-14 w-14" />

        <div className="min-w-0 flex-1">
          <p className="tabular text-display text-content-primary">
            {degrees(current.temperature)}
          </p>
          <p className="text-caption text-content-secondary">{current.label}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Reading
          icon={<Thermometer className="h-4 w-4 text-flame" aria-hidden />}
          label="احساس واقعی"
          value={degrees(current.apparentTemperature)}
        />
        <Reading
          icon={<Droplets className="h-4 w-4 text-sky" aria-hidden />}
          label="رطوبت"
          value={`${toPersianDigits(current.humidity)}٪`}
        />
        <Reading
          icon={<Wind className="h-4 w-4 text-violet" aria-hidden />}
          label="باد"
          value={toPersianDigits(current.windSpeed)}
          unit="کیلومتر/ساعت"
        />
      </dl>
    </section>
  );
}

function Reading({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-card bg-surface-raised p-3">
      {icon}
      <dd className="tabular mt-2 text-title text-content-primary">{value}</dd>
      {/* The unit gets its own line rather than riding after a separator: at a
          third of a phone's width "باد · کیلومتر/ساعت" wraps mid-separator,
          which reads as a typo. */}
      <dt className="text-caption-sm text-content-muted">
        {label}
        {unit ? <span className="block text-caption-sm opacity-80">{unit}</span> : null}
      </dt>
    </div>
  );
}

function HourlyStrip({ forecast }: { forecast: ForecastDto }) {
  if (forecast.hourly.length === 0) return null;

  return (
    <section aria-label="ساعت‌های پیش رو">
      <h2 className="mb-2 text-title text-content-primary">۲۴ ساعت آینده</h2>

      {/* Time runs right to left here, the direction the page is read in, so
          the earliest hour sits first in the DOM and therefore on the right. */}
      <div className="snap-strip -mx-4 flex gap-2 px-4">
        {forecast.hourly.map((hour, index) => (
          <article
            key={hour.time}
            className={cn(
              'flex w-16 shrink-0 snap-start flex-col items-center gap-1.5 rounded-card border p-2',
              index === 0 ? 'border-violet bg-violet-soft' : 'border-border bg-card',
            )}
          >
            <span className="tabular text-caption-sm text-content-muted">
              {index === 0 ? 'اکنون' : hour.hourLabel}
            </span>

            <WeatherIcon look={hour} className="h-5 w-5" />

            <span className="tabular text-caption text-content-primary">
              {degrees(hour.temperature)}
            </span>

            {/* A zero chance of rain on eighteen of twenty-four cells is noise;
                the number only earns its space once it means something. */}
            <span
              className={cn(
                'tabular text-caption-sm',
                hour.precipitationChance >= 30 ? 'text-sky' : 'text-transparent',
              )}
              aria-hidden={hour.precipitationChance < 30}
            >
              {toPersianDigits(hour.precipitationChance)}٪
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function DailyList({ days }: { days: DailyWeatherDto[] }) {
  if (days.length === 0) return null;

  // One scale for the whole week, so a 12°–18° day is visibly narrower than a
  // 4°–31° one. Per-row scaling would make every bar full width and say nothing.
  const lowest = Math.min(...days.map((day) => day.low));
  const highest = Math.max(...days.map((day) => day.high));
  const span = Math.max(1, highest - lowest);

  return (
    <section aria-label="هفتهٔ پیش رو">
      <h2 className="mb-2 text-title text-content-primary">هفتهٔ پیش رو</h2>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {days.map((day, index) => (
          <li key={day.date} className="flex items-center gap-3 p-3">
            <span className="w-14 shrink-0">
              <span className="block text-caption text-content-primary">
                {index === 0 ? 'امروز' : (JALALI_WEEKDAYS[day.weekdayIndex] ?? '')}
              </span>
              <span className="block text-caption-sm text-content-muted">{day.jalaliLabel}</span>
            </span>

            <WeatherIcon look={day} className="h-5 w-5 shrink-0" />

            <span
              className={cn(
                'tabular w-9 shrink-0 text-caption-sm',
                day.precipitationChance >= 30 ? 'text-sky' : 'text-transparent',
              )}
              aria-hidden={day.precipitationChance < 30}
            >
              {toPersianDigits(day.precipitationChance)}٪
            </span>

            <span className="tabular w-8 shrink-0 text-end text-caption-sm text-content-muted">
              {degrees(day.low)}
            </span>

            <span
              className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunken"
              aria-hidden
            >
              <span
                className="absolute inset-y-0 rounded-pill bg-gradient-to-l from-flame to-sky"
                style={{
                  insetInlineStart: `${((day.low - lowest) / span) * 100}%`,
                  width: `${Math.max(8, ((day.high - day.low) / span) * 100)}%`,
                }}
              />
            </span>

            <span className="tabular w-8 shrink-0 text-caption text-content-primary">
              {degrees(day.high)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ErrorCard({ onRetry, isRetrying }: { onRetry(): void; isRetrying: boolean }) {
  return (
    <section
      className="rounded-card border border-dashed border-border p-8 text-center"
      aria-label="خطای هواشناسی"
    >
      <p className="text-body text-content-primary">هوا را نتوانستیم بگیریم</p>
      <p className="mt-1 text-caption text-content-muted">
        شاید اینترنت قطع است، شاید سرویس هواشناسی شلوغ. هیچ‌کدامش تقصیر تو نیست.
      </p>

      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="kz-pressable mx-auto mt-4 flex min-h-[44px] items-center gap-2 rounded-pill border border-border px-5 text-caption text-content-secondary active:scale-95 disabled:opacity-50"
      >
        <RefreshCw
          className={cn('h-4 w-4 text-violet', isRetrying && 'animate-spin')}
          aria-hidden
        />
        دوباره تلاش کن
      </button>
    </section>
  );
}
