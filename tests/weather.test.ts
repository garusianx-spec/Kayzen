import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/errors';
import {
  DEFAULT_CITY_ID,
  PROVINCES,
  allCities,
  findCity,
  findProvince,
  normaliseQuery,
  searchCities,
} from '@/lib/domain/iran-geo';
import { describeWeatherCode, knownWeatherCodes } from '@/lib/weather/conditions';
import {
  hourLabel,
  jalaliDayLabel,
  toForecast,
  type OpenMeteoPayload,
} from '@/lib/weather/open-meteo';

/**
 * The weather tool.
 *
 * Two things are worth pinning here. The geography, because a wrong coordinate
 * silently returns *some* forecast — for the wrong valley — and nothing else
 * would ever catch it. And the parser, because a response shape is the one part
 * of this feature a third party can change without telling anybody.
 */

const TEHRAN = findCity('tehran')!;
const TEHRAN_PROVINCE = findProvince('tehran')!;

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

describe('PROVINCES', () => {
  it('has all thirty-one', () => {
    expect(PROVINCES).toHaveLength(31);
  });

  it('gives every province at least its capital', () => {
    for (const province of PROVINCES) {
      expect(province.cities.length).toBeGreaterThan(0);
    }
  });

  it('keeps every city id unique across provinces', () => {
    const ids = allCities().map((city) => city.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every province id unique', () => {
    const ids = PROVINCES.map((province) => province.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every city inside Iran', () => {
    // A transposed pair of coordinates lands in the Indian Ocean and returns a
    // perfectly plausible forecast, which is exactly why this is checked.
    for (const city of allCities()) {
      expect(city.latitude, city.id).toBeGreaterThan(24);
      expect(city.latitude, city.id).toBeLessThan(40.5);
      expect(city.longitude, city.id).toBeGreaterThan(43.5);
      expect(city.longitude, city.id).toBeLessThan(64);
    }
  });

  it('names every city in Persian', () => {
    for (const city of allCities()) {
      expect(city.name, city.id).toMatch(/[؀-ۿ]/);
      expect(city.id, city.id).toMatch(/^[a-z-]+$/);
    }
  });

  it('resolves the default city', () => {
    expect(findCity(DEFAULT_CITY_ID)?.city.name).toBe('تهران');
  });
});

describe('findCity', () => {
  it('carries the province back with the city', () => {
    const found = findCity('mashhad');

    expect(found?.city.name).toBe('مشهد');
    expect(found?.province.name).toBe('خراسان رضوی');
  });

  it('is null for something that is not a city', () => {
    expect(findCity('atlantis')).toBeNull();
    expect(findCity('')).toBeNull();
  });
});

describe('normaliseQuery', () => {
  it('folds the two spellings of ی and ک', () => {
    // An Arabic keyboard produces ي and ك; a Persian one produces ی and ک. The
    // same person types the same city name and gets different bytes.
    expect(normaliseQuery('شيراز')).toBe(normaliseQuery('شیراز'));
    expect(normaliseQuery('كرمان')).toBe(normaliseQuery('کرمان'));
  });

  it('drops the zero-width non-joiner', () => {
    expect(normaliseQuery('خمینی‌شهر')).toBe(normaliseQuery('خمینی‌شهر'.replace('‌', '')));
  });

  it('collapses whitespace and trims', () => {
    expect(normaliseQuery('  بندر   عباس ')).toBe('بندر عباس');
  });
});

describe('searchCities', () => {
  it('finds a city by its own name', () => {
    expect(searchCities('مشهد').map((match) => match.city.id)).toContain('mashhad');
  });

  it('finds a city typed on an Arabic keyboard', () => {
    expect(searchCities('شيراز').map((match) => match.city.id)).toContain('shiraz');
  });

  it('offers a whole province when the province is typed', () => {
    const ids = searchCities('گیلان').map((match) => match.city.id);

    expect(ids).toContain('rasht');
    expect(ids).toContain('lahijan');
  });

  it('matches a partial name', () => {
    expect(searchCities('اصف').map((match) => match.city.id)).toContain('isfahan');
  });

  it('answers nothing for an empty query rather than everything', () => {
    expect(searchCities('')).toEqual([]);
    expect(searchCities('   ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchCities('ا', 5)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

describe('describeWeatherCode', () => {
  it('labels every code it claims to know, in Persian', () => {
    for (const code of knownWeatherCodes()) {
      const condition = describeWeatherCode(code);

      expect(condition.label, String(code)).toMatch(/[؀-ۿ]/);
      expect(condition.label, String(code)).not.toBe('نامشخص');
      expect(condition.icon, String(code)).toMatch(/^[A-Z]/);
    }
  });

  it('falls back rather than throwing on a code WMO adds later', () => {
    expect(describeWeatherCode(123).label).toBe('نامشخص');
    expect(describeWeatherCode(-1).icon).toBe('CloudOff');
  });

  it('swaps the sun for the moon after dark', () => {
    // A blazing sun next to ۳° at two in the morning makes a whole screen feel
    // unfinished.
    expect(describeWeatherCode(0, true).icon).toBe('Sun');
    expect(describeWeatherCode(0, false).icon).toBe('Moon');
    expect(describeWeatherCode(1, false).icon).toBe('CloudMoon');
  });

  it('leaves conditions with no sun in them alone at night', () => {
    expect(describeWeatherCode(61, false)).toEqual(describeWeatherCode(61, true));
    expect(describeWeatherCode(95, false).label).toBe('رعدوبرق');
  });
});

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/** Hours `00:00`…`47:00` across two days, as Open-Meteo returns them. */
function hours(day: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCHours(index);
    return `${date.toISOString().slice(0, 10)}T${String(date.getUTCHours()).padStart(2, '0')}:00`;
  });
}

const PAYLOAD: OpenMeteoPayload = {
  utc_offset_seconds: 12_600,
  current: {
    time: '2026-09-18T14:00',
    temperature_2m: 28.4,
    apparent_temperature: 27.1,
    relative_humidity_2m: 22,
    wind_speed_10m: 11.6,
    weather_code: 1,
    is_day: 1,
  },
  hourly: {
    time: hours('2026-09-18', 48),
    temperature_2m: Array.from({ length: 48 }, (_, index) => 20 + (index % 12)),
    weather_code: Array.from({ length: 48 }, (_, index) => (index % 6 === 0 ? 61 : 1)),
    precipitation_probability: Array.from({ length: 48 }, (_, index) => (index % 6 === 0 ? 40 : 0)),
    is_day: Array.from({ length: 48 }, (_, index) => (index % 24 >= 6 && index % 24 < 19 ? 1 : 0)),
  },
  daily: {
    time: [
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ],
    weather_code: [1, 2, 61, 0, 0, 80, 95],
    temperature_2m_max: [30.2, 29.5, 24.1, 27.8, 28.3, 26, 25.4],
    temperature_2m_min: [17.4, 16.8, 14.2, 15.9, 16.1, 15, 14.8],
    precipitation_probability_max: [0, 10, 70, 0, 0, 45, 60],
  },
};

const FETCHED_AT = new Date('2026-09-18T10:30:00Z');

describe('toForecast', () => {
  const forecast = toForecast(PAYLOAD, TEHRAN.city, TEHRAN_PROVINCE, FETCHED_AT);

  it('carries the city and its province', () => {
    expect(forecast.city).toEqual({
      id: 'tehran',
      name: 'تهران',
      provinceId: 'tehran',
      provinceName: 'تهران',
    });
  });

  it('rounds the current reading and describes it', () => {
    expect(forecast.current.temperature).toBe(28);
    expect(forecast.current.apparentTemperature).toBe(27);
    expect(forecast.current.humidity).toBe(22);
    expect(forecast.current.windSpeed).toBe(12);
    expect(forecast.current.label).toBe('کمی ابری');
    expect(forecast.current.isDay).toBe(true);
  });

  it('falls back to the real temperature when "feels like" is missing', () => {
    const payload = {
      ...PAYLOAD,
      current: { ...PAYLOAD.current, apparent_temperature: undefined },
    };

    expect(toForecast(payload, TEHRAN.city, TEHRAN_PROVINCE).current.apparentTemperature).toBe(28);
  });

  it('refuses a payload with no current reading', () => {
    // Everything else degrades; this does not, because the whole screen is
    // built around it. A card reading ۰° is worse than an honest error.
    expect(() => toForecast({}, TEHRAN.city, TEHRAN_PROVINCE)).toThrow(ApiError);
    expect(() => toForecast({ current: { time: 'x' } }, TEHRAN.city, TEHRAN_PROVINCE)).toThrow(
      ApiError,
    );
  });

  it('starts the hourly strip at the current hour, not at midnight', () => {
    expect(forecast.hourly[0]?.time).toBe('2026-09-18T14:00');
    expect(forecast.hourly[0]?.hourLabel).toBe('۱۴');
  });

  it('draws exactly twenty-four hours', () => {
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.hourly.at(-1)?.time).toBe('2026-09-19T13:00');
  });

  it('marks the small hours as night', () => {
    const night = forecast.hourly.find((hour) => hour.time === '2026-09-19T02:00');

    expect(night?.isDay).toBe(false);
  });

  it('starts at the beginning when the payload has no current time', () => {
    const payload = { ...PAYLOAD, current: { ...PAYLOAD.current, time: undefined } };
    const result = toForecast(payload, TEHRAN.city, TEHRAN_PROVINCE);

    expect(result.hourly[0]?.time).toBe('2026-09-18T00:00');
  });

  it('survives an hourly block that is missing entirely', () => {
    const payload = { ...PAYLOAD, hourly: undefined };

    expect(toForecast(payload, TEHRAN.city, TEHRAN_PROVINCE).hourly).toEqual([]);
  });

  it('skips an hour whose temperature came back null', () => {
    const temperatures = [...(PAYLOAD.hourly?.temperature_2m ?? [])];
    temperatures[14] = null;

    const payload = { ...PAYLOAD, hourly: { ...PAYLOAD.hourly, temperature_2m: temperatures } };
    const result = toForecast(payload, TEHRAN.city, TEHRAN_PROVINCE);

    expect(result.hourly[0]?.time).toBe('2026-09-18T15:00');
  });

  it('gives seven days, labelled in Jalali', () => {
    expect(forecast.daily).toHaveLength(7);
    expect(forecast.daily[0]?.jalaliLabel).toBe('۲۷ شهریور');
    expect(forecast.daily[0]?.weekdayIndex).toBe(6); // جمعه
    expect(forecast.daily[1]?.weekdayIndex).toBe(0); // شنبه
  });

  it('rounds the highs and lows and keeps them in order', () => {
    for (const day of forecast.daily) {
      expect(Number.isInteger(day.high)).toBe(true);
      expect(Number.isInteger(day.low)).toBe(true);
      expect(day.high).toBeGreaterThanOrEqual(day.low);
    }

    expect(forecast.daily[0]?.high).toBe(30);
    expect(forecast.daily[0]?.low).toBe(17);
  });

  it('never describes a daily summary as night-time', () => {
    // A day has both; the summary is about the daylight half of it.
    for (const day of forecast.daily) {
      expect(day.isDay).toBe(true);
    }
  });

  it('skips a day with no high or low rather than inventing one', () => {
    const highs = [...(PAYLOAD.daily?.temperature_2m_max ?? [])];
    highs[2] = null;

    const payload = { ...PAYLOAD, daily: { ...PAYLOAD.daily, temperature_2m_max: highs } };

    expect(toForecast(payload, TEHRAN.city, TEHRAN_PROVINCE).daily).toHaveLength(6);
  });

  it('records when it was fetched', () => {
    expect(forecast.fetchedAt).toBe(FETCHED_AT.toISOString());
  });
});

describe('label helpers', () => {
  it('reads the hour out of a naive local timestamp', () => {
    expect(hourLabel('2026-09-18T09:00')).toBe('۰۹');
    expect(hourLabel('2026-09-18T23:00')).toBe('۲۳');
  });

  it('converts a calendar date without letting the runtime zone shift it', () => {
    // The value carries no zone; handing it to `new Date()` in a western
    // timezone would move the whole week back a day.
    expect(jalaliDayLabel('2026-09-18')).toBe('۲۷ شهریور');
    expect(jalaliDayLabel('2026-03-21')).toBe('۱ فروردین');
  });
});
