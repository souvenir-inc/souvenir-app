// The one place the app's locale is set (35-locale-and-time.md SD-IN-02). Every Intl formatter
// takes it from here, so no call site names "en-US" or "en-GB" itself.
//
// The app is English-only and server-renders, so the locale is fixed rather than read from the
// browser: a browser-chosen locale would render different text on the server and the client
// (SD-IN-11). en-GB matches the designs ("13 Nov", "Revenue, Orders and AOV"); numbers read the
// same as en-US. Switching to the viewer's locale is this one line once hydration allows it.
export const APP_LOCALE = 'en-GB'
