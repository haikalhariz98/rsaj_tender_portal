/**
 * A user agent as a person would say it: "Chrome on Windows". For the list of an account's sessions, where the raw string is unreadable
 * and a person is looking for the sign-in that is not theirs. A guess from the string's own words, never more: where it is not recognised the
 * list says so rather than inventing a browser.
 */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/(?:\bChrome|HeadlessChrome|\bCriOS)\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/\bWindows\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

export function describeUserAgent(userAgent: string): string {
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `A browser on ${system}`;
  return "A device not recognised";
}
