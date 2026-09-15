/**
 * The inline script that paints the right palette on the very first frame.
 *
 * React cannot do this: by the time hydration runs, the browser has already
 * painted at least one frame, and a dark-mode user would see a white flash on
 * every cold start — which, in an installed app launched from the home screen,
 * happens constantly.
 *
 * It is admitted by the CSP through the per-request nonce that
 * `src/middleware.ts` mints — not through a hash. A hash would work for this
 * one script, but adding any hash to `script-src` makes the browser ignore
 * `'unsafe-inline'`, which silently blocks the inline scripts Next.js streams
 * the RSC payload through. One nonce covers both.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=localStorage.getItem('kayzen:preferences');var t=r?JSON.parse(r).state.theme:'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t==='light'?'light':'dark';var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',t==='light'?'#F8F7FC':'#0B0B14');}}catch(e){document.documentElement.dataset.theme='dark';}})();`;
