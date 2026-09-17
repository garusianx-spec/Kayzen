/**
 * The starter vocabulary corpus.
 *
 * Global reference data, in the same category as `books-365.ts`: shared by
 * every learner, seeded with `npm run db:seed`, and grown by appending here.
 *
 * Each entry carries a Persian *pronunciation*, not just a meaning. All five
 * languages are written in Latin script, and a Persian reader who cannot sound
 * out `Entschuldigung` will not learn it from a translation alone — the
 * transliteration is what makes the word sayable, which is what makes it
 * stick.
 *
 * Fifteen words per language per level is a starting point, not a course: it
 * is a day and a half at the default of ten a day, after which the engine
 * wraps and says so. Adding entries is the whole maintenance story — the
 * selection engine needs no changes, and past deliveries are unaffected
 * because they are persisted rather than recomputed.
 */

import type { LearningLanguage, LearningLevel } from '@prisma/client';

export interface VocabularySeed {
  /** The word, as written in the target language. */
  t: string;
  /** How to say it, in Persian script. */
  tr: string;
  /** Persian meaning. */
  fa: string;
  /** Part of speech, in Persian. */
  pos: string;
}

type Corpus = Record<LearningLanguage, Record<LearningLevel, VocabularySeed[]>>;

export const VOCABULARY_CORPUS: Corpus = {
  ENGLISH: {
    BEGINNER: [
      { t: 'water', tr: 'واتِر', fa: 'آب', pos: 'اسم' },
      { t: 'bread', tr: 'بِرد', fa: 'نان', pos: 'اسم' },
      { t: 'house', tr: 'هاوس', fa: 'خانه', pos: 'اسم' },
      { t: 'friend', tr: 'فِرِند', fa: 'دوست', pos: 'اسم' },
      { t: 'morning', tr: 'مورنینگ', fa: 'صبح', pos: 'اسم' },
      { t: 'to walk', tr: 'تو واک', fa: 'راه رفتن', pos: 'فعل' },
      { t: 'to eat', tr: 'تو ایت', fa: 'خوردن', pos: 'فعل' },
      { t: 'big', tr: 'بیگ', fa: 'بزرگ', pos: 'صفت' },
      { t: 'small', tr: 'اسمال', fa: 'کوچک', pos: 'صفت' },
      { t: 'today', tr: 'تودِی', fa: 'امروز', pos: 'قید' },
      { t: 'book', tr: 'بوک', fa: 'کتاب', pos: 'اسم' },
      { t: 'city', tr: 'سیتی', fa: 'شهر', pos: 'اسم' },
      { t: 'to work', tr: 'تو وُرک', fa: 'کار کردن', pos: 'فعل' },
      { t: 'happy', tr: 'هَپی', fa: 'خوشحال', pos: 'صفت' },
      { t: 'thank you', tr: 'تنک یو', fa: 'ممنون', pos: 'عبارت' },
    ],
    INTERMEDIATE: [
      { t: 'habit', tr: 'هَبیت', fa: 'عادت', pos: 'اسم' },
      { t: 'progress', tr: 'پراگرِس', fa: 'پیشرفت', pos: 'اسم' },
      { t: 'to improve', tr: 'تو ایمپروو', fa: 'بهتر کردن', pos: 'فعل' },
      { t: 'patience', tr: 'پِیشِنس', fa: 'صبر', pos: 'اسم' },
      { t: 'to achieve', tr: 'تو اَچیو', fa: 'به دست آوردن', pos: 'فعل' },
      { t: 'consistent', tr: 'کانسیستِنت', fa: 'پیوسته، یکنواخت', pos: 'صفت' },
      { t: 'reminder', tr: 'ریمایندِر', fa: 'یادآور', pos: 'اسم' },
      { t: 'to deserve', tr: 'تو دیزِرو', fa: 'سزاوار بودن', pos: 'فعل' },
      { t: 'effort', tr: 'اِفِرت', fa: 'تلاش', pos: 'اسم' },
      { t: 'gradually', tr: 'گِرَجوالی', fa: 'به‌تدریج', pos: 'قید' },
      { t: 'to postpone', tr: 'تو پوستپون', fa: 'به تعویق انداختن', pos: 'فعل' },
      { t: 'reliable', tr: 'ریلایِبل', fa: 'قابل اعتماد', pos: 'صفت' },
      { t: 'budget', tr: 'باجِت', fa: 'بودجه', pos: 'اسم' },
      { t: 'to focus', tr: 'تو فوکِس', fa: 'تمرکز کردن', pos: 'فعل' },
      { t: 'balance', tr: 'بَلِنس', fa: 'تعادل', pos: 'اسم' },
    ],
    ADVANCED: [
      { t: 'perseverance', tr: 'پِرسِویرِنس', fa: 'پشتکار', pos: 'اسم' },
      { t: 'to cultivate', tr: 'تو کالتیویت', fa: 'پروراندن', pos: 'فعل' },
      { t: 'incremental', tr: 'اینکرِمِنتال', fa: 'گام‌به‌گام', pos: 'صفت' },
      { t: 'resilience', tr: 'ریزیلیِنس', fa: 'تاب‌آوری', pos: 'اسم' },
      { t: 'to procrastinate', tr: 'تو پروکرَستینیت', fa: 'امروز و فردا کردن', pos: 'فعل' },
      { t: 'deliberate', tr: 'دیلیبِرِت', fa: 'سنجیده، عمدی', pos: 'صفت' },
      { t: 'threshold', tr: 'ترِشولد', fa: 'آستانه', pos: 'اسم' },
      { t: 'to refine', tr: 'تو ریفاین', fa: 'پالودن', pos: 'فعل' },
      { t: 'diligence', tr: 'دیلیجِنس', fa: 'کوشایی', pos: 'اسم' },
      { t: 'sustainable', tr: 'سِستِینِبل', fa: 'پایدار', pos: 'صفت' },
      { t: 'to accumulate', tr: 'تو اَکیومیولیت', fa: 'انباشتن', pos: 'فعل' },
      { t: 'discernment', tr: 'دیسِرنمِنت', fa: 'قوهٔ تشخیص', pos: 'اسم' },
      { t: 'meticulous', tr: 'مِتیکیولِس', fa: 'موشکاف', pos: 'صفت' },
      { t: 'to underestimate', tr: 'تو آندِراِستیمیت', fa: 'دست‌کم گرفتن', pos: 'فعل' },
      { t: 'momentum', tr: 'مومِنتِم', fa: 'شتاب، جنبش', pos: 'اسم' },
    ],
  },

  TURKISH: {
    BEGINNER: [
      { t: 'su', tr: 'سو', fa: 'آب', pos: 'اسم' },
      { t: 'ekmek', tr: 'اِکمِک', fa: 'نان', pos: 'اسم' },
      { t: 'ev', tr: 'اِو', fa: 'خانه', pos: 'اسم' },
      { t: 'arkadaş', tr: 'آرکاداش', fa: 'دوست', pos: 'اسم' },
      { t: 'sabah', tr: 'صاباح', fa: 'صبح', pos: 'اسم' },
      { t: 'yürümek', tr: 'یوروومِک', fa: 'راه رفتن', pos: 'فعل' },
      { t: 'yemek', tr: 'یِمِک', fa: 'خوردن؛ غذا', pos: 'فعل/اسم' },
      { t: 'büyük', tr: 'بویوک', fa: 'بزرگ', pos: 'صفت' },
      { t: 'küçük', tr: 'کوچوک', fa: 'کوچک', pos: 'صفت' },
      { t: 'bugün', tr: 'بوگون', fa: 'امروز', pos: 'قید' },
      { t: 'kitap', tr: 'کیتاپ', fa: 'کتاب', pos: 'اسم' },
      { t: 'şehir', tr: 'شِهیر', fa: 'شهر', pos: 'اسم' },
      { t: 'çalışmak', tr: 'چالیشماک', fa: 'کار کردن', pos: 'فعل' },
      { t: 'mutlu', tr: 'موتلو', fa: 'خوشحال', pos: 'صفت' },
      { t: 'teşekkürler', tr: 'تِشِککورلِر', fa: 'ممنون', pos: 'عبارت' },
    ],
    INTERMEDIATE: [
      { t: 'alışkanlık', tr: 'آلیشکانلیک', fa: 'عادت', pos: 'اسم' },
      { t: 'ilerleme', tr: 'ایلِرلِمه', fa: 'پیشرفت', pos: 'اسم' },
      { t: 'geliştirmek', tr: 'گِلیشتیرمِک', fa: 'بهتر کردن', pos: 'فعل' },
      { t: 'sabır', tr: 'صابیر', fa: 'صبر', pos: 'اسم' },
      { t: 'başarmak', tr: 'باشارماک', fa: 'موفق شدن', pos: 'فعل' },
      { t: 'düzenli', tr: 'دوزِنلی', fa: 'منظم', pos: 'صفت' },
      { t: 'hatırlatıcı', tr: 'هاتیرلاتیجی', fa: 'یادآور', pos: 'اسم' },
      { t: 'çaba', tr: 'چابا', fa: 'تلاش', pos: 'اسم' },
      { t: 'yavaş yavaş', tr: 'یاواش یاواش', fa: 'کم‌کم', pos: 'قید' },
      { t: 'ertelemek', tr: 'اِرتِلِمِک', fa: 'به تعویق انداختن', pos: 'فعل' },
      { t: 'güvenilir', tr: 'گووِنیلیر', fa: 'قابل اعتماد', pos: 'صفت' },
      { t: 'bütçe', tr: 'بوتچه', fa: 'بودجه', pos: 'اسم' },
      { t: 'odaklanmak', tr: 'اوداکلانماک', fa: 'تمرکز کردن', pos: 'فعل' },
      { t: 'denge', tr: 'دِنگه', fa: 'تعادل', pos: 'اسم' },
      { t: 'deneyim', tr: 'دِنِییم', fa: 'تجربه', pos: 'اسم' },
    ],
    ADVANCED: [
      { t: 'azim', tr: 'عَزیم', fa: 'پشتکار', pos: 'اسم' },
      { t: 'özveri', tr: 'اؤزوِری', fa: 'از خودگذشتگی', pos: 'اسم' },
      { t: 'kararlılık', tr: 'کارارلیلیک', fa: 'اراده، قاطعیت', pos: 'اسم' },
      { t: 'sürdürülebilir', tr: 'سوردورولِبیلیر', fa: 'پایدار', pos: 'صفت' },
      { t: 'biriktirmek', tr: 'بیریکتیرمِک', fa: 'انباشتن', pos: 'فعل' },
      { t: 'titiz', tr: 'تیتیز', fa: 'موشکاف', pos: 'صفت' },
      { t: 'eşik', tr: 'اِشیک', fa: 'آستانه', pos: 'اسم' },
      { t: 'olgunlaşmak', tr: 'اولگونلاشماک', fa: 'پخته شدن', pos: 'فعل' },
      { t: 'dayanıklılık', tr: 'دایانیکلیلیک', fa: 'تاب‌آوری', pos: 'اسم' },
      { t: 'küçümsemek', tr: 'کوچومسِمِک', fa: 'دست‌کم گرفتن', pos: 'فعل' },
      { t: 'bilinçli', tr: 'بیلینچلی', fa: 'آگاهانه', pos: 'صفت' },
      { t: 'ivme', tr: 'ایومه', fa: 'شتاب', pos: 'اسم' },
      { t: 'geliştirici', tr: 'گِلیشتیریجی', fa: 'بهبوددهنده', pos: 'صفت' },
      { t: 'farkındalık', tr: 'فارکینداليک', fa: 'آگاهی، ذهن‌آگاهی', pos: 'اسم' },
      { t: 'yeterlilik', tr: 'یِتِرلیلیک', fa: 'شایستگی', pos: 'اسم' },
    ],
  },

  FRENCH: {
    BEGINNER: [
      { t: "l'eau", tr: 'لو', fa: 'آب', pos: 'اسم' },
      { t: 'le pain', tr: 'لُ پَن', fa: 'نان', pos: 'اسم' },
      { t: 'la maison', tr: 'لا مِزون', fa: 'خانه', pos: 'اسم' },
      { t: "l'ami", tr: 'لَمی', fa: 'دوست', pos: 'اسم' },
      { t: 'le matin', tr: 'لُ مَتَن', fa: 'صبح', pos: 'اسم' },
      { t: 'marcher', tr: 'مارشه', fa: 'راه رفتن', pos: 'فعل' },
      { t: 'manger', tr: 'مانژه', fa: 'خوردن', pos: 'فعل' },
      { t: 'grand', tr: 'گرَن', fa: 'بزرگ', pos: 'صفت' },
      { t: 'petit', tr: 'پُتی', fa: 'کوچک', pos: 'صفت' },
      { t: "aujourd'hui", tr: 'اوژوردویی', fa: 'امروز', pos: 'قید' },
      { t: 'le livre', tr: 'لُ لیور', fa: 'کتاب', pos: 'اسم' },
      { t: 'la ville', tr: 'لا ویل', fa: 'شهر', pos: 'اسم' },
      { t: 'travailler', tr: 'تراوایه', fa: 'کار کردن', pos: 'فعل' },
      { t: 'heureux', tr: 'اورو', fa: 'خوشحال', pos: 'صفت' },
      { t: 'merci', tr: 'مِرسی', fa: 'ممنون', pos: 'عبارت' },
    ],
    INTERMEDIATE: [
      { t: "l'habitude", tr: 'لابیتود', fa: 'عادت', pos: 'اسم' },
      { t: 'le progrès', tr: 'لُ پروگره', fa: 'پیشرفت', pos: 'اسم' },
      { t: 'améliorer', tr: 'آمِلیوره', fa: 'بهتر کردن', pos: 'فعل' },
      { t: 'la patience', tr: 'لا پاسیانس', fa: 'صبر', pos: 'اسم' },
      { t: 'réussir', tr: 'رِئوسیر', fa: 'موفق شدن', pos: 'فعل' },
      { t: 'régulier', tr: 'رِگولیه', fa: 'منظم', pos: 'صفت' },
      { t: 'le rappel', tr: 'لُ راپِل', fa: 'یادآور', pos: 'اسم' },
      { t: "l'effort", tr: 'لِفور', fa: 'تلاش', pos: 'اسم' },
      { t: 'peu à peu', tr: 'پو آ پو', fa: 'کم‌کم', pos: 'قید' },
      { t: 'reporter', tr: 'رُپورته', fa: 'به تعویق انداختن', pos: 'فعل' },
      { t: 'fiable', tr: 'فیابل', fa: 'قابل اعتماد', pos: 'صفت' },
      { t: 'le budget', tr: 'لُ بودژه', fa: 'بودجه', pos: 'اسم' },
      { t: 'se concentrer', tr: 'سُ کُنسانتره', fa: 'تمرکز کردن', pos: 'فعل' },
      { t: "l'équilibre", tr: 'لِکیلیبر', fa: 'تعادل', pos: 'اسم' },
      { t: "l'expérience", tr: 'لِکسپِریانس', fa: 'تجربه', pos: 'اسم' },
    ],
    ADVANCED: [
      { t: 'la persévérance', tr: 'لا پِرسِوِرانس', fa: 'پشتکار', pos: 'اسم' },
      { t: 'cultiver', tr: 'کولتیوه', fa: 'پروراندن', pos: 'فعل' },
      { t: 'progressif', tr: 'پروگرِسیف', fa: 'گام‌به‌گام', pos: 'صفت' },
      { t: 'la résilience', tr: 'لا رِزیلیانس', fa: 'تاب‌آوری', pos: 'اسم' },
      { t: 'tergiverser', tr: 'تِرژیوِرسه', fa: 'امروز و فردا کردن', pos: 'فعل' },
      { t: 'délibéré', tr: 'دِلیبِره', fa: 'سنجیده', pos: 'صفت' },
      { t: 'le seuil', tr: 'لُ سوی', fa: 'آستانه', pos: 'اسم' },
      { t: 'affiner', tr: 'آفینه', fa: 'پالودن', pos: 'فعل' },
      { t: 'la diligence', tr: 'لا دیلیژانس', fa: 'کوشایی', pos: 'اسم' },
      { t: 'durable', tr: 'دورابل', fa: 'پایدار', pos: 'صفت' },
      { t: 'accumuler', tr: 'آکوموله', fa: 'انباشتن', pos: 'فعل' },
      { t: 'le discernement', tr: 'لُ دیسِرنُمان', fa: 'قوهٔ تشخیص', pos: 'اسم' },
      { t: 'méticuleux', tr: 'مِتیکولو', fa: 'موشکاف', pos: 'صفت' },
      { t: 'sous-estimer', tr: 'سوزِستیمه', fa: 'دست‌کم گرفتن', pos: 'فعل' },
      { t: "l'élan", tr: 'لِلان', fa: 'شتاب، جنبش', pos: 'اسم' },
    ],
  },

  GERMAN: {
    BEGINNER: [
      { t: 'das Wasser', tr: 'داس واسِر', fa: 'آب', pos: 'اسم' },
      { t: 'das Brot', tr: 'داس بروت', fa: 'نان', pos: 'اسم' },
      { t: 'das Haus', tr: 'داس هاوس', fa: 'خانه', pos: 'اسم' },
      { t: 'der Freund', tr: 'دِر فروینت', fa: 'دوست', pos: 'اسم' },
      { t: 'der Morgen', tr: 'دِر مورگِن', fa: 'صبح', pos: 'اسم' },
      { t: 'gehen', tr: 'گِهِن', fa: 'رفتن', pos: 'فعل' },
      { t: 'essen', tr: 'اِسِن', fa: 'خوردن', pos: 'فعل' },
      { t: 'groß', tr: 'گروس', fa: 'بزرگ', pos: 'صفت' },
      { t: 'klein', tr: 'کلاین', fa: 'کوچک', pos: 'صفت' },
      { t: 'heute', tr: 'هویتِه', fa: 'امروز', pos: 'قید' },
      { t: 'das Buch', tr: 'داس بوخ', fa: 'کتاب', pos: 'اسم' },
      { t: 'die Stadt', tr: 'دی اشتات', fa: 'شهر', pos: 'اسم' },
      { t: 'arbeiten', tr: 'آربایتِن', fa: 'کار کردن', pos: 'فعل' },
      { t: 'glücklich', tr: 'گلوکلیش', fa: 'خوشحال', pos: 'صفت' },
      { t: 'danke', tr: 'دانکه', fa: 'ممنون', pos: 'عبارت' },
    ],
    INTERMEDIATE: [
      { t: 'die Gewohnheit', tr: 'دی گِوونهایت', fa: 'عادت', pos: 'اسم' },
      { t: 'der Fortschritt', tr: 'دِر فورتشریت', fa: 'پیشرفت', pos: 'اسم' },
      { t: 'verbessern', tr: 'فِربِسِرن', fa: 'بهتر کردن', pos: 'فعل' },
      { t: 'die Geduld', tr: 'دی گِدولد', fa: 'صبر', pos: 'اسم' },
      { t: 'erreichen', tr: 'اِرایشِن', fa: 'به دست آوردن', pos: 'فعل' },
      { t: 'regelmäßig', tr: 'رِگِلمِسیش', fa: 'منظم', pos: 'صفت' },
      { t: 'die Erinnerung', tr: 'دی اِرینِرونگ', fa: 'یادآوری', pos: 'اسم' },
      { t: 'die Mühe', tr: 'دی مووِه', fa: 'تلاش، زحمت', pos: 'اسم' },
      { t: 'allmählich', tr: 'آلمِلیش', fa: 'به‌تدریج', pos: 'قید' },
      { t: 'verschieben', tr: 'فِرشیبِن', fa: 'به تعویق انداختن', pos: 'فعل' },
      { t: 'zuverlässig', tr: 'تسوفِرلِسیش', fa: 'قابل اعتماد', pos: 'صفت' },
      { t: 'das Budget', tr: 'داس بودژه', fa: 'بودجه', pos: 'اسم' },
      { t: 'sich konzentrieren', tr: 'زیش کونتسِنتریرِن', fa: 'تمرکز کردن', pos: 'فعل' },
      { t: 'das Gleichgewicht', tr: 'داس گلایش‌گِویشت', fa: 'تعادل', pos: 'اسم' },
      { t: 'die Erfahrung', tr: 'دی اِرفارونگ', fa: 'تجربه', pos: 'اسم' },
    ],
    ADVANCED: [
      { t: 'die Beharrlichkeit', tr: 'دی بِهارلیشکایت', fa: 'پشتکار', pos: 'اسم' },
      { t: 'pflegen', tr: 'فلِگِن', fa: 'پروراندن', pos: 'فعل' },
      { t: 'schrittweise', tr: 'شریت‌وایزه', fa: 'گام‌به‌گام', pos: 'صفت/قید' },
      { t: 'die Widerstandskraft', tr: 'دی ویدِرشتاندس‌کرافت', fa: 'تاب‌آوری', pos: 'اسم' },
      { t: 'aufschieben', tr: 'آوفشیبِن', fa: 'امروز و فردا کردن', pos: 'فعل' },
      { t: 'bewusst', tr: 'بِووست', fa: 'آگاهانه', pos: 'صفت' },
      { t: 'die Schwelle', tr: 'دی شوِله', fa: 'آستانه', pos: 'اسم' },
      { t: 'verfeinern', tr: 'فِرفاینِرن', fa: 'پالودن', pos: 'فعل' },
      { t: 'der Fleiß', tr: 'دِر فلایس', fa: 'کوشایی', pos: 'اسم' },
      { t: 'nachhaltig', tr: 'ناخ‌هالتیش', fa: 'پایدار', pos: 'صفت' },
      { t: 'ansammeln', tr: 'آنزامِلن', fa: 'انباشتن', pos: 'فعل' },
      { t: 'das Urteilsvermögen', tr: 'داس اورتایلس‌فِرمؤگِن', fa: 'قوهٔ تشخیص', pos: 'اسم' },
      { t: 'sorgfältig', tr: 'زورگفِلتیش', fa: 'موشکاف، دقیق', pos: 'صفت' },
      { t: 'unterschätzen', tr: 'اونتِرشِتسِن', fa: 'دست‌کم گرفتن', pos: 'فعل' },
      { t: 'der Schwung', tr: 'دِر شوونگ', fa: 'شتاب، جنبش', pos: 'اسم' },
    ],
  },

  SPANISH: {
    BEGINNER: [
      { t: 'el agua', tr: 'اِل آگوا', fa: 'آب', pos: 'اسم' },
      { t: 'el pan', tr: 'اِل پان', fa: 'نان', pos: 'اسم' },
      { t: 'la casa', tr: 'لا کاسا', fa: 'خانه', pos: 'اسم' },
      { t: 'el amigo', tr: 'اِل آمیگو', fa: 'دوست', pos: 'اسم' },
      { t: 'la mañana', tr: 'لا مانیانا', fa: 'صبح', pos: 'اسم' },
      { t: 'caminar', tr: 'کامینار', fa: 'راه رفتن', pos: 'فعل' },
      { t: 'comer', tr: 'کومِر', fa: 'خوردن', pos: 'فعل' },
      { t: 'grande', tr: 'گرانده', fa: 'بزرگ', pos: 'صفت' },
      { t: 'pequeño', tr: 'پِکِنیو', fa: 'کوچک', pos: 'صفت' },
      { t: 'hoy', tr: 'اوی', fa: 'امروز', pos: 'قید' },
      { t: 'el libro', tr: 'اِل لیبرو', fa: 'کتاب', pos: 'اسم' },
      { t: 'la ciudad', tr: 'لا سیوداد', fa: 'شهر', pos: 'اسم' },
      { t: 'trabajar', tr: 'تراباخار', fa: 'کار کردن', pos: 'فعل' },
      { t: 'feliz', tr: 'فِلیس', fa: 'خوشحال', pos: 'صفت' },
      { t: 'gracias', tr: 'گراسیاس', fa: 'ممنون', pos: 'عبارت' },
    ],
    INTERMEDIATE: [
      { t: 'el hábito', tr: 'اِل آبیتو', fa: 'عادت', pos: 'اسم' },
      { t: 'el progreso', tr: 'اِل پروگرِسو', fa: 'پیشرفت', pos: 'اسم' },
      { t: 'mejorar', tr: 'مِخورار', fa: 'بهتر کردن', pos: 'فعل' },
      { t: 'la paciencia', tr: 'لا پاسیِنسیا', fa: 'صبر', pos: 'اسم' },
      { t: 'lograr', tr: 'لوگرار', fa: 'به دست آوردن', pos: 'فعل' },
      { t: 'constante', tr: 'کونستانته', fa: 'پیوسته', pos: 'صفت' },
      { t: 'el recordatorio', tr: 'اِل رِکورداتوریو', fa: 'یادآور', pos: 'اسم' },
      { t: 'el esfuerzo', tr: 'اِل اِسفوئِرسو', fa: 'تلاش', pos: 'اسم' },
      { t: 'poco a poco', tr: 'پوکو آ پوکو', fa: 'کم‌کم', pos: 'قید' },
      { t: 'aplazar', tr: 'آپلاسار', fa: 'به تعویق انداختن', pos: 'فعل' },
      { t: 'fiable', tr: 'فیابله', fa: 'قابل اعتماد', pos: 'صفت' },
      { t: 'el presupuesto', tr: 'اِل پرِسوپوئِستو', fa: 'بودجه', pos: 'اسم' },
      { t: 'concentrarse', tr: 'کونسِنترارسه', fa: 'تمرکز کردن', pos: 'فعل' },
      { t: 'el equilibrio', tr: 'اِل اِکیلیبریو', fa: 'تعادل', pos: 'اسم' },
      { t: 'la experiencia', tr: 'لا اِکسپِریِنسیا', fa: 'تجربه', pos: 'اسم' },
    ],
    ADVANCED: [
      { t: 'la perseverancia', tr: 'لا پِرسِوِرانسیا', fa: 'پشتکار', pos: 'اسم' },
      { t: 'cultivar', tr: 'کولتیوار', fa: 'پروراندن', pos: 'فعل' },
      { t: 'gradual', tr: 'گرادوال', fa: 'گام‌به‌گام', pos: 'صفت' },
      { t: 'la resiliencia', tr: 'لا رِسیلیِنسیا', fa: 'تاب‌آوری', pos: 'اسم' },
      { t: 'procrastinar', tr: 'پروکراستینار', fa: 'امروز و فردا کردن', pos: 'فعل' },
      { t: 'deliberado', tr: 'دِلیبِرادو', fa: 'سنجیده', pos: 'صفت' },
      { t: 'el umbral', tr: 'اِل اومبرال', fa: 'آستانه', pos: 'اسم' },
      { t: 'refinar', tr: 'رِفینار', fa: 'پالودن', pos: 'فعل' },
      { t: 'la diligencia', tr: 'لا دیلیخِنسیا', fa: 'کوشایی', pos: 'اسم' },
      { t: 'sostenible', tr: 'سوستِنیبله', fa: 'پایدار', pos: 'صفت' },
      { t: 'acumular', tr: 'آکومولار', fa: 'انباشتن', pos: 'فعل' },
      { t: 'el discernimiento', tr: 'اِل دیسِرنیمیِنتو', fa: 'قوهٔ تشخیص', pos: 'اسم' },
      { t: 'meticuloso', tr: 'مِتیکولوسو', fa: 'موشکاف', pos: 'صفت' },
      { t: 'subestimar', tr: 'سوبِستیمار', fa: 'دست‌کم گرفتن', pos: 'فعل' },
      { t: 'el impulso', tr: 'اِل ایمپولسو', fa: 'شتاب، جنبش', pos: 'اسم' },
    ],
  },
};

/** Flattened, for the seed and for the in-memory database. */
export function vocabularyRows(): Array<{
  language: LearningLanguage;
  level: LearningLevel;
  term: string;
  transliteration: string;
  meaningFa: string;
  partOfSpeech: string;
}> {
  const rows = [];

  for (const [language, levels] of Object.entries(VOCABULARY_CORPUS)) {
    for (const [level, words] of Object.entries(levels)) {
      for (const word of words) {
        rows.push({
          language: language as LearningLanguage,
          level: level as LearningLevel,
          term: word.t,
          transliteration: word.tr,
          meaningFa: word.fa,
          partOfSpeech: word.pos,
        });
      }
    }
  }

  return rows;
}
