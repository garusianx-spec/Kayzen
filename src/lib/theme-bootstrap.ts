/**
 * The inline script that paints the right palette on the very first frame.
 *
 * React cannot do this: by the time hydration runs, the browser has already
 * painted at least one frame, and a dark-mode user would see a white flash on
 * every cold start — which, in an installed app launched from the home screen,
 * happens constantly.
 *
 * The string is exported as a constant so that its SHA-256 can be computed
 * mechanically and allow-listed in the Content-Security-Policy (see
 * `next.config.ts` and `scripts/csp-hash.mjs`). Edit this and the hash must be
 * regenerated, or the script is blocked and the flash comes back.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=localStorage.getItem('kayzen:preferences');var t=r?JSON.parse(r).state.theme:'dark';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t==='light'?'light':'dark';var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute('content',t==='light'?'#F8F7FC':'#0B0B14');}}catch(e){document.documentElement.dataset.theme='dark';}})();`;
