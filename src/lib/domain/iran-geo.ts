/**
 * Iran's thirty-one provinces, and the cities worth a forecast in each.
 *
 * Bundled rather than fetched. The list changes at the pace of parliamentary
 * redistricting, a network round trip to learn that تهران is in تهران is a
 * round trip spent badly, and a weather tool that cannot offer a city until it
 * has reached the internet is a weather tool that shows a spinner on the
 * subway.
 *
 * Coordinates are city-centre approximations, good to a kilometre or so. That
 * is well inside the resolution of any forecast model — the point is to land in
 * the right valley, not on the right street.
 *
 * Each province leads with its capital (`ostan` centre), because that is the
 * city most people opening the province actually want. The rest are ordered by
 * how likely somebody is to be looking for them, not alphabetically: a picker
 * sorted by the Persian alphabet buries مشهد under three towns nobody typed.
 */

export interface City {
  /** Stable slug. Stored in the browser and sent to the forecast route. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Province {
  id: string;
  name: string;
  /** Capital first, then the rest by likely demand. */
  cities: readonly City[];
}

const city = (id: string, name: string, latitude: number, longitude: number): City => ({
  id,
  name,
  latitude,
  longitude,
});

export const PROVINCES: readonly Province[] = [
  {
    id: 'tehran',
    name: 'تهران',
    cities: [
      city('tehran', 'تهران', 35.6892, 51.389),
      city('rey', 'شهرری', 35.5928, 51.4344),
      city('eslamshahr', 'اسلام‌شهر', 35.5522, 51.235),
      city('varamin', 'ورامین', 35.3247, 51.6458),
      city('damavand', 'دماوند', 35.7178, 52.065),
      city('pakdasht', 'پاکدشت', 35.4794, 51.68),
    ],
  },
  {
    id: 'alborz',
    name: 'البرز',
    cities: [
      city('karaj', 'کرج', 35.84, 50.9391),
      city('fardis', 'فردیس', 35.7264, 50.9756),
      city('nazarabad', 'نظرآباد', 35.95, 50.6069),
      city('hashtgerd', 'هشتگرد', 35.9611, 50.6806),
    ],
  },
  {
    id: 'khorasan-razavi',
    name: 'خراسان رضوی',
    cities: [
      city('mashhad', 'مشهد', 36.2605, 59.6168),
      city('neyshabur', 'نیشابور', 36.2133, 58.7958),
      city('sabzevar', 'سبزوار', 36.2126, 57.6819),
      city('torbat-heydarieh', 'تربت حیدریه', 35.274, 59.2194),
      city('quchan', 'قوچان', 37.1058, 58.5097),
    ],
  },
  {
    id: 'isfahan',
    name: 'اصفهان',
    cities: [
      city('isfahan', 'اصفهان', 32.6546, 51.668),
      city('kashan', 'کاشان', 33.985, 51.41),
      city('najafabad', 'نجف‌آباد', 32.6342, 51.3667),
      city('khomeinishahr', 'خمینی‌شهر', 32.7, 51.5211),
      city('shahinshahr', 'شاهین‌شهر', 32.8653, 51.5522),
    ],
  },
  {
    id: 'fars',
    name: 'فارس',
    cities: [
      city('shiraz', 'شیراز', 29.5918, 52.5837),
      city('marvdasht', 'مرودشت', 29.8742, 52.8025),
      city('jahrom', 'جهرم', 28.5, 53.5606),
      city('fasa', 'فسا', 28.9383, 53.6482),
      city('kazerun', 'کازرون', 29.6194, 51.6541),
      city('lar', 'لار', 27.6817, 54.3342),
    ],
  },
  {
    id: 'khuzestan',
    name: 'خوزستان',
    cities: [
      city('ahvaz', 'اهواز', 31.3183, 48.6706),
      city('abadan', 'آبادان', 30.3392, 48.3043),
      city('dezful', 'دزفول', 32.3831, 48.4058),
      city('khorramshahr', 'خرمشهر', 30.4397, 48.1664),
      city('mahshahr', 'بندر ماهشهر', 30.5589, 49.1981),
      city('behbahan', 'بهبهان', 30.5959, 50.2417),
    ],
  },
  {
    id: 'east-azerbaijan',
    name: 'آذربایجان شرقی',
    cities: [
      city('tabriz', 'تبریز', 38.08, 46.2919),
      city('maragheh', 'مراغه', 37.3833, 46.2333),
      city('marand', 'مرند', 38.4328, 45.7739),
      city('ahar', 'اهر', 38.4769, 47.07),
      city('bonab', 'بناب', 37.3411, 46.0561),
    ],
  },
  {
    id: 'west-azerbaijan',
    name: 'آذربایجان غربی',
    cities: [
      city('urmia', 'ارومیه', 37.5527, 45.0761),
      city('khoy', 'خوی', 38.5503, 44.9521),
      city('mahabad', 'مهاباد', 36.7631, 45.7222),
      city('miandoab', 'میاندوآب', 36.9694, 46.1028),
      city('bukan', 'بوکان', 36.5211, 46.2089),
    ],
  },
  {
    id: 'mazandaran',
    name: 'مازندران',
    cities: [
      city('sari', 'ساری', 36.5633, 53.0601),
      city('babol', 'بابل', 36.5513, 52.679),
      city('amol', 'آمل', 36.47, 52.3508),
      city('qaemshahr', 'قائم‌شهر', 36.4631, 52.86),
      city('nowshahr', 'نوشهر', 36.6489, 51.4964),
      city('ramsar', 'رامسر', 36.9114, 50.6581),
    ],
  },
  {
    id: 'gilan',
    name: 'گیلان',
    cities: [
      city('rasht', 'رشت', 37.2808, 49.5832),
      city('bandar-anzali', 'بندر انزلی', 37.4722, 49.4583),
      city('lahijan', 'لاهیجان', 37.2072, 50.0039),
      city('rudsar', 'رودسر', 37.1378, 50.2839),
      city('astara', 'آستارا', 38.4292, 48.8722),
    ],
  },
  {
    id: 'kerman',
    name: 'کرمان',
    cities: [
      city('kerman', 'کرمان', 30.2839, 57.0834),
      city('rafsanjan', 'رفسنجان', 30.4067, 55.9939),
      city('sirjan', 'سیرجان', 29.4525, 55.6811),
      city('bam', 'بم', 29.106, 58.357),
      city('jiroft', 'جیرفت', 28.6753, 57.7375),
    ],
  },
  {
    id: 'south-khorasan',
    name: 'خراسان جنوبی',
    cities: [
      city('birjand', 'بیرجند', 32.8663, 59.2211),
      city('qaen', 'قائن', 33.7267, 59.1844),
      city('tabas', 'طبس', 33.5959, 56.9244),
      city('ferdows', 'فردوس', 34.0181, 58.1739),
    ],
  },
  {
    id: 'north-khorasan',
    name: 'خراسان شمالی',
    cities: [
      city('bojnurd', 'بجنورد', 37.471, 57.329),
      city('shirvan', 'شیروان', 37.4097, 57.9294),
      city('esfarayen', 'اسفراین', 37.0764, 57.51),
    ],
  },
  {
    id: 'qom',
    name: 'قم',
    cities: [city('qom', 'قم', 34.6416, 50.8746)],
  },
  {
    id: 'qazvin',
    name: 'قزوین',
    cities: [
      city('qazvin', 'قزوین', 36.2797, 50.0049),
      city('takestan', 'تاکستان', 36.0697, 49.6961),
      city('alvand', 'الوند', 36.1917, 50.08),
    ],
  },
  {
    id: 'zanjan',
    name: 'زنجان',
    cities: [
      city('zanjan', 'زنجان', 36.6736, 48.4787),
      city('abhar', 'ابهر', 36.1467, 49.2181),
      city('khodabandeh', 'خدابنده', 35.9997, 48.5836),
    ],
  },
  {
    id: 'ardabil',
    name: 'اردبیل',
    cities: [
      city('ardabil', 'اردبیل', 38.2498, 48.2933),
      city('parsabad', 'پارس‌آباد', 39.6486, 47.9174),
      city('meshgin-shahr', 'مشگین‌شهر', 38.3989, 47.6819),
      city('khalkhal', 'خلخال', 37.6189, 48.5258),
    ],
  },
  {
    id: 'hamadan',
    name: 'همدان',
    cities: [
      city('hamadan', 'همدان', 34.7992, 48.5146),
      city('malayer', 'ملایر', 34.2992, 48.8236),
      city('nahavand', 'نهاوند', 34.1889, 48.3775),
      city('tuyserkan', 'تویسرکان', 34.5461, 48.4469),
    ],
  },
  {
    id: 'kermanshah',
    name: 'کرمانشاه',
    cities: [
      city('kermanshah', 'کرمانشاه', 34.3277, 47.0778),
      city('eslamabad-gharb', 'اسلام‌آباد غرب', 34.1097, 46.5275),
      city('sarpol-zahab', 'سرپل ذهاب', 34.4611, 45.8622),
      city('kangavar', 'کنگاور', 34.5042, 47.9653),
    ],
  },
  {
    id: 'kurdistan',
    name: 'کردستان',
    cities: [
      city('sanandaj', 'سنندج', 35.3119, 46.9862),
      city('saqqez', 'سقز', 36.2494, 46.2731),
      city('baneh', 'بانه', 35.9975, 45.8853),
      city('marivan', 'مریوان', 35.5219, 46.1769),
      city('bijar', 'بیجار', 35.8642, 47.6053),
    ],
  },
  {
    id: 'lorestan',
    name: 'لرستان',
    cities: [
      city('khorramabad', 'خرم‌آباد', 33.4878, 48.3558),
      city('borujerd', 'بروجرد', 33.8973, 48.7516),
      city('dorud', 'دورود', 33.4989, 49.0567),
      city('aligudarz', 'الیگودرز', 33.4003, 49.6947),
    ],
  },
  {
    id: 'markazi',
    name: 'مرکزی',
    cities: [
      city('arak', 'اراک', 34.0954, 49.7013),
      city('saveh', 'ساوه', 35.0213, 50.3566),
      city('khomein', 'خمین', 33.6386, 50.0789),
      city('mahallat', 'محلات', 33.9086, 50.4553),
    ],
  },
  {
    id: 'golestan',
    name: 'گلستان',
    cities: [
      city('gorgan', 'گرگان', 36.8427, 54.4436),
      city('gonbad-kavus', 'گنبد کاووس', 37.25, 55.1672),
      city('aliabad-katul', 'علی‌آباد کتول', 36.9061, 54.8636),
      city('bandar-torkaman', 'بندر ترکمن', 36.8992, 54.07),
    ],
  },
  {
    id: 'semnan',
    name: 'سمنان',
    cities: [
      city('semnan', 'سمنان', 35.5729, 53.3971),
      city('shahrud', 'شاهرود', 36.4181, 54.9764),
      city('damghan', 'دامغان', 36.1683, 54.3481),
      city('garmsar', 'گرمسار', 35.2183, 52.3406),
    ],
  },
  {
    id: 'yazd',
    name: 'یزد',
    cities: [
      city('yazd', 'یزد', 31.8974, 54.3569),
      city('meybod', 'میبد', 32.24, 54.0164),
      city('ardakan', 'اردکان', 32.31, 54.0175),
      city('bafq', 'بافق', 31.6033, 55.4106),
    ],
  },
  {
    id: 'hormozgan',
    name: 'هرمزگان',
    cities: [
      city('bandar-abbas', 'بندرعباس', 27.1865, 56.2808),
      city('qeshm', 'قشم', 26.9581, 56.2719),
      city('kish', 'کیش', 26.5323, 53.9809),
      city('minab', 'میناب', 27.1467, 57.08),
      city('bandar-lengeh', 'بندر لنگه', 26.5581, 54.8808),
    ],
  },
  {
    id: 'bushehr',
    name: 'بوشهر',
    cities: [
      city('bushehr', 'بوشهر', 28.9234, 50.8203),
      city('borazjan', 'برازجان', 29.2694, 51.2181),
      city('genaveh', 'بندر گناوه', 29.5794, 50.5178),
      city('asaluyeh', 'عسلویه', 27.4756, 52.6075),
    ],
  },
  {
    id: 'sistan-baluchestan',
    name: 'سیستان و بلوچستان',
    cities: [
      city('zahedan', 'زاهدان', 29.4963, 60.8629),
      city('chabahar', 'چابهار', 25.2919, 60.6431),
      city('zabol', 'زابل', 31.0286, 61.5011),
      city('iranshahr', 'ایرانشهر', 27.2025, 60.6848),
      city('saravan', 'سراوان', 27.3706, 62.335),
    ],
  },
  {
    id: 'chaharmahal-bakhtiari',
    name: 'چهارمحال و بختیاری',
    cities: [
      city('shahrekord', 'شهرکرد', 32.3256, 50.8644),
      city('borujen', 'بروجن', 31.9653, 51.2872),
      city('lordegan', 'لردگان', 31.5122, 50.8292),
      city('farsan', 'فارسان', 32.2564, 50.5658),
    ],
  },
  {
    id: 'kohgiluyeh-boyerahmad',
    name: 'کهگیلویه و بویراحمد',
    cities: [
      city('yasuj', 'یاسوج', 30.6682, 51.588),
      city('gachsaran', 'گچساران', 30.3583, 50.7981),
      city('dehdasht', 'دهدشت', 30.795, 50.5647),
    ],
  },
  {
    id: 'ilam',
    name: 'ایلام',
    cities: [
      city('ilam', 'ایلام', 33.6374, 46.4227),
      city('dehloran', 'دهلران', 32.6942, 47.2678),
      city('abdanan', 'آبدانان', 32.9928, 47.4194),
      city('mehran', 'مهران', 33.1222, 46.1647),
    ],
  },
] as const;

/** The city the picker opens on before anybody has chosen. */
export const DEFAULT_CITY_ID = 'tehran';

/** Flat index, built once. `find` over 31 nested arrays per request is silly. */
const CITY_INDEX = new Map<string, { city: City; province: Province }>(
  PROVINCES.flatMap((province) =>
    province.cities.map((entry) => [entry.id, { city: entry, province }] as const),
  ),
);

export interface ResolvedCity {
  city: City;
  province: Province;
}

export function findCity(id: string): ResolvedCity | null {
  return CITY_INDEX.get(id) ?? null;
}

export function findProvince(id: string): Province | null {
  return PROVINCES.find((province) => province.id === id) ?? null;
}

/** Every city, for tests and for the count in the picker's subtitle. */
export function allCities(): City[] {
  return [...CITY_INDEX.values()].map((entry) => entry.city);
}

/**
 * Matches a typed query against city *and* province names.
 *
 * Persian has two spellings of ك/ک and ي/ی that the same keyboard produces
 * interchangeably, plus an Arabic-Indic digit set; a search that does not fold
 * them finds nothing for half the people who type مشهد on an Arabic layout.
 */
export function normaliseQuery(input: string): string {
  return input
    .trim()
    .replace(/[يى]/g, 'ی') // ي, ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/[‌‏‎]/g, '') // ZWNJ and the direction marks
    .replace(/ـ/g, '') // tatweel
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function searchCities(query: string, limit = 12): ResolvedCity[] {
  const needle = normaliseQuery(query);
  if (needle.length === 0) return [];

  const matches: ResolvedCity[] = [];

  for (const entry of CITY_INDEX.values()) {
    const cityName = normaliseQuery(entry.city.name);
    const provinceName = normaliseQuery(entry.province.name);

    if (
      cityName.includes(needle) ||
      provinceName.includes(needle) ||
      entry.city.id.includes(needle)
    ) {
      matches.push(entry);
      if (matches.length >= limit) break;
    }
  }

  return matches;
}
