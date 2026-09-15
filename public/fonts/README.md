# Fonts

Kayzen's type is **Yekan Bakh**, which is commercially licensed — the binaries
are deliberately not committed.

Drop the licensed files here and they are picked up automatically by the
`@font-face` rules in `src/app/globals.css`:

```
public/fonts/
  YekanBakh-Regular.woff2     (400)
  YekanBakh-Medium.woff2      (500)
  YekanBakh-Bold.woff2        (700)
  YekanBakh-ExtraBold.woff2   (800)
```

Until then the app is fully usable: each `@font-face` declares a `local()`
source first (so a system-installed copy is used when present) and the Tailwind
stack falls back to Vazirmatn → Tahoma → the system sans. Persian text renders
correctly throughout; only the brand voice of the type is missing.

`font-display: swap` is set on every face. That matters more here than on a
typical site — a blocking Persian webfont on a slow mobile connection leaves a
screen of invisible text, which reads as a broken app rather than a slow one.

If you convert from `.ttf`, subset to the Arabic ranges plus Latin digits; a
full Yekan Bakh face is ~400 KB per weight, a subset around 60 KB.
