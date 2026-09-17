/**
 * جملهٔ روز — the daily line.
 *
 * Short, Persian, and about the one idea the app is built on: a small
 * improvement repeated is not small. Kept deliberately unattributed where the
 * saying is proverbial, and attributed where it is not, because a wrong
 * attribution is worse than none.
 *
 * Global reference data, like the library and the vocabulary corpus. The
 * selection is by day index rather than random, so everyone reading the app on
 * the same day sees the same line — which is what makes it a *daily* quote
 * rather than a shuffle.
 */

export interface DailyQuote {
  text: string;
  /** Null when the line is proverbial or anonymous. */
  author: string | null;
}

export const DAILY_QUOTES: readonly DailyQuote[] = [
  { text: 'قطره‌قطره جمع گردد، وانگهی دریا شود.', author: null },
  { text: 'هر روز یک درصد بهتر؛ سالی سی‌وهفت برابر.', author: null },
  { text: 'کاری که هر روز می‌کنی، مهم‌تر از کاری است که گاهی می‌کنی.', author: null },
  { text: 'بزرگ‌ترین سفرها با یک قدم آغاز می‌شوند.', author: 'لائوتسه' },
  { text: 'آهسته برو، اما نایست.', author: null },
  { text: 'عادت، طنابی است که هر روز رشته‌ای به آن می‌بافیم.', author: 'هوراس مان' },
  { text: 'کمال، وقتی می‌رسد که چیزی برای کم‌کردن نمانده باشد.', author: 'سنت‌اگزوپری' },
  { text: 'شروع‌نکردن، تنها شکست واقعی است.', author: null },
  { text: 'امروز همان فردایی است که دیروز نگرانش بودی.', author: null },
  { text: 'نظم، پلی است میان هدف و دستاورد.', author: null },
  { text: 'آن‌که صبر دارد، به هرچه بخواهد می‌رسد.', author: 'بنجامین فرانکلین' },
  { text: 'کوچک‌ترین قدم در مسیر درست، بهترین قدم زندگی است.', author: null },
  { text: 'به جای شمردن روزها، روزها را به حساب بیاور.', author: null },
  { text: 'تمرکز یعنی نه گفتن به صد ایدهٔ خوب.', author: 'استیو جابز' },
  { text: 'هرچه می‌کاری، همان را می‌دروی؛ پس دانه را خوب انتخاب کن.', author: null },
  { text: 'خستگی از کار نیست، از کارِ نیمه‌تمام است.', author: null },
  { text: 'دانش اندکی که به کار بیاید، از دانش بسیارِ بی‌مصرف بهتر است.', author: null },
  { text: 'یک ساعتِ تمرکز، از یک روزِ پراکندگی بیشتر می‌ارزد.', author: null },
  { text: 'پیشرفت، بی‌سروصداست؛ فقط در آینهٔ ماه‌ها دیده می‌شود.', author: null },
  { text: 'هر پایان، آغازی است که لباس عوض کرده.', author: null },
  { text: 'سخت‌ترین بخش هر کار، نشستن پای آن است.', author: null },
  { text: 'به خودت سخت نگیر؛ فقط پیوسته باش.', author: null },
  { text: 'رؤیا بدون برنامه، فقط یک آرزوست.', author: 'آنتوان دو سنت‌اگزوپری' },
  { text: 'هیچ بادی برای کشتی‌ای که مقصد ندارد موافق نیست.', author: 'سنکا' },
  { text: 'امروز کمی بهتر از دیروز؛ همین کافی است.', author: null },
  { text: 'زمان را نمی‌شود مدیریت کرد؛ خودت را می‌شود.', author: null },
  { text: 'آنچه اندازه می‌گیری، بهتر می‌شود.', author: null },
  { text: 'کتابی که خوانده نشود، با کتابی که نوشته نشده فرقی ندارد.', author: null },
  { text: 'هر روز یک صفحه، سالی دوازده کتاب.', author: null },
  { text: 'استقامت، جایگزین استعداد نیست؛ از آن قوی‌تر است.', author: null },
  { text: 'راه هزار فرسنگی، زیر پای توست.', author: null },
] as const;

/**
 * The line for a given day.
 *
 * Indexed by the Jalali day key rather than by a random draw, so the quote is
 * the same for everybody and the same all day — and so re-opening the app is
 * never a way to shop for a nicer one.
 */
export function quoteForDay(dayKey: string): DailyQuote {
  // Digits only, so "1405-06-26" becomes a number that advances by one each
  // day without needing a date library on the client.
  const digits = dayKey.replace(/\D/g, '');
  const index = Number(digits.slice(-5)) % DAILY_QUOTES.length;

  return DAILY_QUOTES[index] ?? (DAILY_QUOTES[0] as DailyQuote);
}
