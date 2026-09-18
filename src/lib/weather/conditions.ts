/**
 * WMO weather codes, in Persian.
 *
 * Open-Meteo answers with the WMO 4677 code table — an integer per hour. The
 * table has ninety-odd entries and draws distinctions no phone screen needs
 * ("slight" vs "moderate" drizzle), so this collapses it to the fifteen things
 * a person actually decides between: do I take a coat, do I take an umbrella,
 * can I see the road.
 *
 * Icons are lucide names resolved by the component, the same way the home
 * widget registry does it — this module stays free of JSX so it can be unit
 * tested and imported by the route handler.
 */

export interface WeatherCondition {
  label: string;
  /** Lucide icon name. */
  icon: string;
  /** A palette token, so a rainy day and a clear one do not look alike. */
  tone: 'violet' | 'flame' | 'emerald' | 'rose' | 'sky';
}

const CLEAR: WeatherCondition = { label: 'آفتابی', icon: 'Sun', tone: 'flame' };
const MOSTLY_CLEAR: WeatherCondition = { label: 'کمی ابری', icon: 'CloudSun', tone: 'flame' };
const PARTLY_CLOUDY: WeatherCondition = { label: 'نیمه‌ابری', icon: 'CloudSun', tone: 'sky' };
const OVERCAST: WeatherCondition = { label: 'ابری', icon: 'Cloud', tone: 'sky' };
const FOG: WeatherCondition = { label: 'مه', icon: 'CloudFog', tone: 'sky' };
const DRIZZLE: WeatherCondition = { label: 'نم‌نم باران', icon: 'CloudDrizzle', tone: 'sky' };
const FREEZING_DRIZZLE: WeatherCondition = {
  label: 'نم‌نم یخ‌زده',
  icon: 'CloudDrizzle',
  tone: 'violet',
};
const RAIN_LIGHT: WeatherCondition = { label: 'باران سبک', icon: 'CloudRain', tone: 'sky' };
const RAIN: WeatherCondition = { label: 'باران', icon: 'CloudRain', tone: 'sky' };
const RAIN_HEAVY: WeatherCondition = { label: 'باران شدید', icon: 'CloudRainWind', tone: 'violet' };
const FREEZING_RAIN: WeatherCondition = {
  label: 'باران یخ‌زده',
  icon: 'CloudHail',
  tone: 'violet',
};
const SNOW: WeatherCondition = { label: 'برف', icon: 'CloudSnow', tone: 'violet' };
const SNOW_HEAVY: WeatherCondition = { label: 'برف سنگین', icon: 'CloudSnow', tone: 'violet' };
const SHOWERS: WeatherCondition = { label: 'رگبار', icon: 'CloudRain', tone: 'sky' };
const THUNDER: WeatherCondition = { label: 'رعدوبرق', icon: 'CloudLightning', tone: 'rose' };
const THUNDER_HAIL: WeatherCondition = {
  label: 'رعدوبرق و تگرگ',
  icon: 'CloudLightning',
  tone: 'rose',
};

const CODES: Record<number, WeatherCondition> = {
  0: CLEAR,
  1: MOSTLY_CLEAR,
  2: PARTLY_CLOUDY,
  3: OVERCAST,
  45: FOG,
  48: FOG,
  51: DRIZZLE,
  53: DRIZZLE,
  55: DRIZZLE,
  56: FREEZING_DRIZZLE,
  57: FREEZING_DRIZZLE,
  61: RAIN_LIGHT,
  63: RAIN,
  65: RAIN_HEAVY,
  66: FREEZING_RAIN,
  67: FREEZING_RAIN,
  71: SNOW,
  73: SNOW,
  75: SNOW_HEAVY,
  77: SNOW,
  80: SHOWERS,
  81: SHOWERS,
  82: RAIN_HEAVY,
  85: SNOW,
  86: SNOW_HEAVY,
  95: THUNDER,
  96: THUNDER_HAIL,
  99: THUNDER_HAIL,
};

/**
 * The night version of a clear sky.
 *
 * Only two entries differ after dark, and both are about the sun being in the
 * icon. Drawing a blazing sun next to `۳°` at two in the morning is the kind of
 * detail that makes a whole screen feel unfinished.
 */
const NIGHT: Record<number, WeatherCondition> = {
  0: { label: 'صاف', icon: 'Moon', tone: 'violet' },
  1: { label: 'کمی ابری', icon: 'CloudMoon', tone: 'violet' },
  2: { label: 'نیمه‌ابری', icon: 'CloudMoon', tone: 'sky' },
};

/** Anything the table does not know about. WMO adds codes; we do not crash. */
const UNKNOWN: WeatherCondition = { label: 'نامشخص', icon: 'CloudOff', tone: 'sky' };

export function describeWeatherCode(code: number, isDay = true): WeatherCondition {
  if (!isDay) {
    const night = NIGHT[code];
    if (night) return night;
  }

  return CODES[code] ?? UNKNOWN;
}

/** Every code the table knows, for tests. */
export function knownWeatherCodes(): number[] {
  return Object.keys(CODES).map(Number);
}
