import type { Metadata } from 'next';
import { CloudOff } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'آفلاین',
  description: 'این صفحه در حالت آفلاین در دسترس نیست.',
};

/**
 * The page the service worker serves when a navigation cannot be satisfied
 * from the cache and the network is gone.
 *
 * Statically rendered on purpose: it is precached at install time, so it is
 * available precisely when nothing else is.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-viewport flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="rounded-full bg-surface-raised p-5 text-flame">
        <CloudOff className="h-8 w-8" aria-hidden />
      </span>

      <h1 className="text-title-lg text-content-primary">فعلاً آفلاین هستید</h1>
      <p className="text-body text-content-muted">
        این بخش هنوز ذخیره نشده است. هر تغییری که ثبت کرده باشید محفوظ است و به‌محض وصل‌شدن ارسال
        می‌شود.
      </p>

      <Link
        href="/"
        className="kz-pressable mt-2 rounded-pill bg-violet-gradient px-6 py-3 text-body text-white"
      >
        بازگشت به امروز
      </Link>
    </main>
  );
}
