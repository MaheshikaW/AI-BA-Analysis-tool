/**
 * Minimal hash-based router (no vue-router dependency).
 * Routes: #/ (dashboard), #/feature/:id/competitor-analysis, #/feature/:id/use-case
 */
export function getRouteFromHash() {
  const h = (typeof window !== 'undefined' && window.location.hash
    ? window.location.hash
    : '#/'
  ).slice(1);
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'feature' && parts[1] && parts[2] === 'competitor-analysis') {
    return { name: 'competitor-analysis', params: { id: parts[1] } };
  }
  if (parts[0] === 'feature' && parts[1] && parts[2] === 'use-case') {
    return { name: 'use-case', params: { id: parts[1] } };
  }
  return { name: 'dashboard' };
}

export function navigate(path) {
  if (typeof window === 'undefined') return;
  window.location.hash = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
}
