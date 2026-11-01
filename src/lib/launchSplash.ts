/**
 * The opening animation of the installed app (Add to Home Screen) on a phone.
 *
 * It is a layer in the page itself (`#bnp-splash`, see layout.tsx and the `.bnp-splash` rules in globals.css), drawn by CSS from the very
 * first frame, so there is no gap between the phone's own launch screen and the app. The script below decides, before first paint, whether
 * this visit gets it: only a phone running the installed app, only the first page load of a launch (a launch lasts as long as the app stays
 * open, which is what sessionStorage lasts), and never after a manual reload. A browser tab, a tablet or a computer never sees it.
 * `?splash=1` forces it for a preview in any browser.
 */

/** The splash stays at least this long (from the start of the page load), so the animation reads as a whole even on a fast phone. */
export const SPLASH_MIN_MS = 3200;
/** How long the way out takes. Keep in step with `bnp-splash-out` in globals.css. */
export const SPLASH_EXIT_MS = 320;

export const SPLASH_STORAGE_KEY = "bnp-splash-shown";

export const LAUNCH_SPLASH_SCRIPT = `
(function(){
  try {
    var forced = /[?&]splash=1(&|$)/.test(window.location.search);
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    var phone = window.matchMedia('(max-width: 767px)').matches;
    if (!forced && !(standalone && phone)) return;
    if (!forced) {
      var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
      if (nav && nav.type === 'reload') return;
      if (window.sessionStorage.getItem('${SPLASH_STORAGE_KEY}')) return;
    }
    try { window.sessionStorage.setItem('${SPLASH_STORAGE_KEY}', '1'); } catch (e) {}
    document.documentElement.setAttribute('data-splash', '1');
  } catch (e) {}
})();
`.trim();
