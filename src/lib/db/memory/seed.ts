import { BOOKS_365 } from '../../../../prisma/data/books-365';
import { vocabularyRows } from '../../../../prisma/data/vocabulary';
import { hashPassword } from '../../auth/password';
import type { MemoryStore } from './engine';

/**
 * What the in-memory database starts with.
 *
 * Two jobs. The first is the 365-library, which is global reference data the
 * real deployment loads with `npm run db:seed`; without it the library screens
 * render an error rather than a day. The second is one demo account with enough
 * belonging to it that the home screen has something to lay out — an empty
 * account is a poor thing to design against, and "is this screen broken or just
 * empty?" is a question worth never having to ask.
 *
 * Nothing here is a fixture in the test sense. It is the state a developer opens
 * the app into.
 */

export const DEMO_PHONE = '+989123456789';
export const DEMO_PASSWORD = 'kayzen-dev';
export const DEMO_OTP_HINT = 'any code, when AUTH_DEV_OTP_CODE is set';

function at(base: Date, days: number, hour = 9): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * Hours from now, clamped to today.
 *
 * Today's tasks are placed relative to the clock rather than at a fixed hour,
 * so starting the server in the evening does not open the app onto a list that
 * is already overdue.
 */
function soon(base: Date, hours: number): Date {
  const date = new Date(base.getTime() + hours * 3_600_000);
  const endOfDay = new Date(base);
  endOfDay.setHours(23, 30, 0, 0);

  return date > endOfDay ? endOfDay : date;
}

export async function seedMemoryStore(store: MemoryStore): Promise<{ userId: string }> {
  const now = new Date();

  for (const book of BOOKS_365) {
    store.create('Book365', {
      data: {
        dayNumber: book.dayNumber,
        title: book.title,
        titleFa: book.titleFa,
        author: book.author,
        authorFa: book.authorFa,
        category: book.category,
        summaryFa: book.summaryFa,
        keyTakeaways: [...book.keyTakeaways],
        reflectionPrompt: book.reflectionPrompt,
        readingMinutes: book.readingMinutes,
      },
    });
  }

  for (const word of vocabularyRows()) {
    store.create('VocabularyWord', { data: word });
  }

  const user = store.create('User', {
    data: {
      phone: DEMO_PHONE,
      name: 'کاربر آزمایشی',
      phoneVerifiedAt: now,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      passwordUpdatedAt: now,
      points: 120,
      // Backdated so the library is a few days in and the streak has history.
      enrolledAt: at(now, -6),
      lastSeenAt: now,
      onboardedAt: at(now, -6),
    },
  });

  const userId = user.id as string;

  const habits = [
    { title: 'مطالعهٔ روزانه', icon: '📖', colorToken: 'violet' },
    { title: 'پیاده‌روی', icon: '🚶', colorToken: 'emerald' },
    { title: 'نوشیدن آب', icon: '💧', colorToken: 'sky' },
  ];

  for (const [index, habit] of habits.entries()) {
    const created = store.create('Habit', {
      data: {
        userId,
        title: habit.title,
        icon: habit.icon,
        colorToken: habit.colorToken,
        currentStreak: index === 2 ? 1 : 4,
        longestStreak: index === 2 ? 3 : 6,
        lastCompletedOn: at(now, -1),
        createdAt: at(now, -6),
      },
    });

    // A partial history, so the streak engine has something real to compute
    // rather than a flat zero. The third habit skips a day on purpose: a broken
    // streak is a state the UI has to render too.
    for (let back = 1; back <= 4; back += 1) {
      if (index === 2 && back === 2) continue;

      store.create('HabitLog', {
        data: {
          userId,
          habitId: created.id,
          logDate: at(now, -back, 0),
          count: 1,
        },
      });
    }
  }

  const tasks = [
    { title: 'بازبینی طرح صفحهٔ ورود', difficulty: 'MEDIUM', dueAt: soon(now, 3) },
    { title: 'تمرین زبان — ۲۰ دقیقه', difficulty: 'EASY', dueAt: soon(now, 5) },
    { title: 'خرید هفتگی', difficulty: 'TRIVIAL', dueAt: at(now, 1, 11) },
    { title: 'پاسخ به ایمیل‌ها', difficulty: 'EASY', dueAt: at(now, -1, 16) },
  ];

  for (const [index, task] of tasks.entries()) {
    store.create('Task', {
      data: {
        userId,
        title: task.title,
        difficulty: task.difficulty,
        dueAt: task.dueAt,
        position: index,
        // One already done, so the list has both states on first paint.
        ...(index === 3 ? { status: 'COMPLETED', completedAt: at(now, -1, 17) } : {}),
      },
    });
  }

  store.create('FinancialBox', {
    data: {
      userId,
      title: 'سفر تابستان',
      icon: '✈️',
      category: 'TRAVEL',
      targetAmount: 50_000_000,
      currentAmount: 12_500_000,
    },
  });

  store.create('CountdownEvent', {
    data: {
      userId,
      title: 'نوروز',
      icon: '🌱',
      eventAt: at(now, 45, 0),
    },
  });

  // Two of the three languages the brief allows, so the screen opens on
  // something to do rather than on a chooser.
  for (const [language, level] of [
    ['ENGLISH', 'INTERMEDIATE'],
    ['TURKISH', 'BEGINNER'],
  ] as const) {
    store.create('LanguageCourse', { data: { userId, language, level } });
  }

  store.create('Note', {
    data: {
      userId,
      title: 'ایده‌های محصول',
      body: 'یادداشت نمونه برای توسعهٔ محلی.\n\n- مورد اول\n- مورد دوم',
      isPinned: true,
    },
  });

  // A little history, so the notification centre opens onto something and the
  // bell has a badge to draw.
  const notifications = [
    {
      category: 'TASK_REMINDER',
      title: 'کارهای امروزت منتظرند',
      body: 'دو کار برای امروز مانده؛ اولی کمتر از ده دقیقه وقت می‌برد.',
      deepLink: '/',
      readAt: null,
      createdAt: new Date(now.getTime() - 40 * 60_000),
    },
    {
      category: 'VOCABULARY',
      title: 'ده واژهٔ امروز آماده است',
      body: 'انگلیسی، سطح متوسط — از «gradually» شروع می‌کنیم.',
      deepLink: '/tools/vocabulary',
      readAt: null,
      createdAt: new Date(now.getTime() - 3 * 3_600_000),
    },
    {
      category: 'HABIT_PROMPT',
      title: 'زنجیرهٔ مطالعه‌ات ۴ روزه شد',
      body: 'یک روز دیگر تا رکورد خودت.',
      deepLink: '/habits',
      readAt: new Date(now.getTime() - 20 * 3_600_000),
      createdAt: new Date(now.getTime() - 22 * 3_600_000),
    },
    {
      category: 'FINANCIAL_MILESTONE',
      title: 'یک‌چهارم راه سفر تابستان',
      body: '۱۲٬۵۰۰٬۰۰۰ تومان از ۵۰ میلیون جمع شده.',
      deepLink: '/finance',
      readAt: new Date(now.getTime() - 30 * 3_600_000),
      createdAt: new Date(now.getTime() - 30 * 3_600_000),
    },
  ] as const;

  for (const notification of notifications) {
    store.create('NotificationLog', { data: { userId, ...notification } });
  }

  return { userId };
}
