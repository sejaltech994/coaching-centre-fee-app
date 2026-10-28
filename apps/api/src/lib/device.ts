/**
 * "Chrome on Windows" from a browser's User-Agent, for the Devices list in
 * Settings. Only the common browsers and systems are named; order matters,
 * since most browsers also claim to be Chrome or Safari.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/(OPR|Opera)\//, "Opera"],
  [/(Firefox|FxiOS)\//, "Firefox"],
  [/(Chrome|CriOS)\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

const find = (list: [RegExp, string][], ua: string) => list.find(([pattern]) => pattern.test(ua))?.[1];

export function describeDevice(userAgent: string | null | undefined): string {
  const browser = userAgent && find(BROWSERS, userAgent);
  const system = userAgent && find(SYSTEMS, userAgent);
  if (!browser || !system) return "Unknown device";
  return `${browser} on ${system}`;
}
