// Facebook, Instagram, WhatsApp, Messenger and LinkedIn open links in a browser
// of their own, where Google refuses to sign anyone in. The forms say so, and
// keep the Google button from failing without a word.
export const isInAppBrowser = typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|WhatsApp|Messenger|LinkedIn/i.test(navigator.userAgent);
