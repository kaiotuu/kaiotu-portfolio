// Tiny user-agent sorting: only coarse classes are kept (never the raw user agent).
export const isBot = (ua) => !ua || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|discordbot|whatsapp|telegram|curl|wget|python|node-fetch|axios|monitor|pingdom|uptime|scanner|httpclient|go-http|java\//i.test(ua);
export const parseUA = (ua = '') => {
  const device = /ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) ? 'Tablet' : /mobi|iphone|ipod|android/i.test(ua) ? 'Mobile' : 'Desktop';
  let browser = 'Other';
  if (/instagram/i.test(ua)) browser = 'In-app: Instagram';
  else if (/FBAN|FBAV/i.test(ua)) browser = 'In-app: Facebook';
  else if (/musical_ly|tiktok|bytedance/i.test(ua)) browser = 'In-app: TikTok';
  else if (/discord/i.test(ua)) browser = 'In-app: Discord';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  return { device, browser, os };
};
export const screenBucket = (w) => (w < 480 ? '< 480 (phone)' : w < 768 ? '480–767' : w < 1024 ? '768–1023 (tablet)' : w < 1440 ? '1024–1439' : '1440+');
