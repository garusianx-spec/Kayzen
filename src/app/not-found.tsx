import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-viewport flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="tabular text-display-lg text-violet">۴۰۴</p>
      <h1 className="text-title-lg text-content-primary">این صفحه پیدا نشد</h1>
      <p className="text-body text-content-muted">شاید نشانی تغییر کرده باشد.</p>

      <Link
        href="/"
        className="kz-pressable mt-2 rounded-pill bg-violet-gradient px-6 py-3 text-body text-white"
      >
        بازگشت به امروز
      </Link>
    </main>
  );
}
