// Mobile detector based on User-Agent
export function isMobile(req) {
  if (!req || !req.headers || !req.headers['user-agent']) return false;
  const ua = req.headers['user-agent'].toLowerCase();
  const mobileKeywords = [
    'mobile', 'android', 'iphone', 'ipad', 'ipod', 'windows phone',
    'webos', 'blackberry', 'opera mini', 'opera mobi', 'iemobile',
    'kindle', 'silk', 'playbook', 'tablet', 'mobi', 'touch'
  ];
  return mobileKeywords.some(k => ua.includes(k));
}

export function isTablet(req) {
  if (!req || !req.headers || !req.headers['user-agent']) return false;
  const ua = req.headers['user-agent'].toLowerCase();
  // Tablet keywords but not mobile
  const tabletKeywords = ['ipad', 'android.*tablet', 'windows.*tablet', 'kindle', 'silk'];
  return tabletKeywords.some(k => ua.includes(k)) && !ua.includes('mobile');
}

export function isDesktop(req) {
  return !isMobile(req) && !isTablet(req);
}
