import { toPersianDigits } from '../date/digits';
import { formatShortJalaliDate, jalaliWeekdayIndex, toWallClock } from '../date/jalali';
import { ApiError } from '../errors';
import { logger } from '../logger';
import { describeWeatherCode } from './conditions';
import type { City, Province } from '../domain/iran-geo';
import type { DailyWeatherDto, ForecastDto, HourlyWeatherDto } from '@/types/domain';

/**
 * Forecasts, from Open-Meteo.
 *
 * Chosen because it needs no API key and no account. Every alternative worth
 * using wants a key, which would mean the weather tool silently does nothing
 * for anybody who clones this repository — and a feature that only works for
 * the person who set it up is a feature that rots.
 *
 * Two halves, deliberately separated: {@link fetchForecast} touches the network
 * and {@link toForecast} is pure. The parser is where every bug in a response
 * shape lives, so it is the half with tests — a fixture goes in, a DTO comes
 * out, and no test needs an internet connection or a live third party to fail
 * honestly.
 *
 * Times arrive as *local naive* ISO strings (`"2026-09-18T14:00"`) because the
 * request pins `timezone`. That is a feature: the strings are already in the
 * reader's own reckoning, so "the next six hours" is a slice rather than a
 * conversion. It also means they must never be handed to `new Date()` without
 * an explicit zone — see {@link calendarInstant}.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Fifteen minutes. A forecast that moves faster than that is noise. */
export const FORECAST_TTL_SECONDS = 15 * 60;

const HOURLY_WINDOW = 24;
const DAILY_WINDOW = 7;

/** The shape we ask for, and therefore the only shape the parser accepts. */
export interface OpenMeteoPayload {
  utc_offset_seconds?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
    is_day?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    precipitation_probability?: (number | null)[];
    is_day?: (number | null)[];
  };
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

function forecastUrl(city: Pick<City, 'latitude' | 'longitude'>, timezone: string): string {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    timezone,
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: String(DAILY_WINDOW),
  });

  return `${ENDPOINT}?${params.toString()}`;
}

export async function fetchForecast(
  city: City,
  province: Province,
  timezone: string,
): Promise<ForecastDto> {
  let response: Response;

  try {
    response = await fetch(forecastUrl(city, timezone), {
      // Cached by Next's data cache, keyed on the URL — so every reader looking
      // at تهران in the same quarter hour shares one upstream request.
      next: { revalidate: FORECAST_TTL_SECONDS },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    // A blocked egress or a timeout is the common case behind a restrictive
    // network, and it deserves a message that says so rather than a 500.
    logger.warn({ err: error, city: city.id }, 'weather provider unreachable');
    throw ApiError.unavailable('هواشناسی در دسترس نیست؛ کمی بعد دوباره امتحان کن.');
  }

  if (!response.ok) {
    logger.warn({ status: response.status, city: city.id }, 'weather provider refused');
    throw ApiError.unavailable('هواشناسی الان جواب نمی‌دهد؛ کمی بعد دوباره امتحان کن.');
  }

  const payload = (await response.json()) as OpenMeteoPayload;
  return toForecast(payload, city, province);
}

/**
 * A local naive calendar value as an instant.
 *
 * `"2026-09-18"` and `"2026-09-18T14:00"` carry no zone, and handing either to
 * `new Date()` makes the *runtime's* zone decide — which on a server in another
 * hemisphere shifts the whole week by a day. Pinning them to noon UTC keeps the
 * calendar date intact through any formatting that follows, which is all these
 * values are ever used for.
 */
function calendarInstant(value: string): Date {
  const day = value.slice(0, 10);
  return new Date(`${day}T12:00:00Z`);
}

/**
 * `"۲۷ شهریور"` — a day label, from a Gregorian calendar date.
 *
 * Formatted in UTC because {@link calendarInstant} put it there: the value is a
 * calendar date with no zone, and pinning both ends to UTC is what keeps it the
 * same date on both sides of the conversion.
 */
export function jalaliDayLabel(date: string): string {
  return formatShortJalaliDate(calendarInstant(date), 'UTC');
}

/** The hour, in Persian digits, on a 24-hour clock: `"۱۴"`. */
export function hourLabel(time: string): string {
  return toPersianDigits(time.slice(11, 13));
}

export function toForecast(
  payload: OpenMeteoPayload,
  city: City,
  province: Province,
  fetchedAt: Date = new Date(),
): ForecastDto {
  const current = payload.current;

  // Everything else degrades; a missing "now" does not, because the whole
  // screen is built around it. Better an honest 503 than a card reading `۰°`.
  if (!current || typeof current.temperature_2m !== 'number') {
    throw ApiError.unavailable('دادهٔ هواشناسی ناقص بود؛ کمی بعد دوباره امتحان کن.');
  }

  const isDay = current.is_day !== 0;
  const currentCode = current.weather_code ?? 0;

  return {
    city: {
      id: city.id,
      name: city.name,
      provinceId: province.id,
      provinceName: province.name,
    },
    current: {
      time: current.time ?? '',
      temperature: Math.round(current.temperature_2m),
      apparentTemperature: Math.round(current.apparent_temperature ?? current.temperature_2m),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      windSpeed: Math.round(current.wind_speed_10m ?? 0),
      isDay,
      code: currentCode,
      ...describeWeatherCode(currentCode, isDay),
    },
    hourly: toHourly(payload, current.time ?? ''),
    daily: toDaily(payload),
    fetchedAt: fetchedAt.toISOString(),
  };
}

/**
 * The next twenty-four hours.
 *
 * The slice starts at the first hour that is not already behind us. Comparing
 * the naive strings is exact here — they share a format, a zone and a length,
 * so lexical order *is* chronological order — and it avoids parsing 168 values
 * to find one index.
 */
function toHourly(payload: OpenMeteoPayload, currentTime: string): HourlyWeatherDto[] {
  const times = payload.hourly?.time ?? [];
  if (times.length === 0) return [];

  const temperatures = payload.hourly?.temperature_2m ?? [];
  const codes = payload.hourly?.weather_code ?? [];
  const chances = payload.hourly?.precipitation_probability ?? [];
  const daylight = payload.hourly?.is_day ?? [];

  // `currentTime` is truncated to the hour by the provider; an empty one (a
  // payload without `current.time`) starts the strip at the beginning.
  const start = Math.max(
    0,
    times.findIndex((time) => time >= currentTime),
  );

  const hours: HourlyWeatherDto[] = [];

  for (let index = start; index < times.length && hours.length < HOURLY_WINDOW; index += 1) {
    const time = times[index];
    const temperature = temperatures[index];
    if (time === undefined || typeof temperature !== 'number') continue;

    const code = codes[index] ?? 0;
    const isDay = daylight[index] !== 0;

    hours.push({
      time,
      hourLabel: hourLabel(time),
      temperature: Math.round(temperature),
      precipitationChance: Math.round(chances[index] ?? 0),
      code,
      isDay,
      ...describeWeatherCode(code, isDay),
    });
  }

  return hours;
}

function toDaily(payload: OpenMeteoPayload): DailyWeatherDto[] {
  const dates = payload.daily?.time ?? [];
  const codes = payload.daily?.weather_code ?? [];
  const highs = payload.daily?.temperature_2m_max ?? [];
  const lows = payload.daily?.temperature_2m_min ?? [];
  const chances = payload.daily?.precipitation_probability_max ?? [];

  const days: DailyWeatherDto[] = [];

  for (const [index, date] of dates.entries()) {
    if (days.length >= DAILY_WINDOW) break;

    const high = highs[index];
    const low = lows[index];
    if (typeof high !== 'number' || typeof low !== 'number') continue;

    const code = codes[index] ?? 0;

    days.push({
      date,
      jalaliLabel: jalaliDayLabel(date),
      weekdayIndex: jalaliWeekdayIndex(toWallClock(calendarInstant(date), 'UTC')),
      high: Math.round(high),
      low: Math.round(low),
      precipitationChance: Math.round(chances[index] ?? 0),
      code,
      // Days have no "is it dark" — a daily summary is about the daytime.
      isDay: true,
      ...describeWeatherCode(code, true),
    });
  }

  return days;
}
