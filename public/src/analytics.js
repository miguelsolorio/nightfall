/* Analytics
   Sends game events to Google Analytics (gtag is set up in index.html).
   Does nothing if gtag failed to load or is blocked.
*/
export function track(name, params) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}
