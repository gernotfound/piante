/** Routing di presentazione M0: nessuna delle rotte interroga dati reali. */
export type Route =
  | { kind: 'home' }
  | { kind: 'app' }
  | { kind: 'profile'; username: string }
  | { kind: 'plant'; username: string; slug: string }
  | { kind: 'not-found' };

const USERNAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const RESERVED = new Set([
  'app', 'api', 'admin', 'auth', 'login', 'logout', 'register', 'settings',
  'public', 'piante', 'privacy', 'terms', 'about', 'assets', 'favicon', 'manifest',
]);

export function parseRoute(pathname: string): Route {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: 'not-found' };
  }
  // Un encoded slash non può diventare un separatore accettato.
  if (/%2f|%5c/i.test(pathname) || decoded.includes('\\') || decoded.includes('//')) {
    return { kind: 'not-found' };
  }

  const segments = decoded.split('/').filter(Boolean);
  if (segments.length === 0) return { kind: 'home' };
  if (segments.length === 1 && segments[0] === 'app') return { kind: 'app' };

  const [username, visibility, slug] = segments;
  if (!USERNAME.test(username ?? '') || RESERVED.has(username) || visibility !== 'public') {
    return { kind: 'not-found' };
  }
  if (segments.length === 2) return { kind: 'profile', username };
  if (segments.length === 3 && SLUG.test(slug)) return { kind: 'plant', username, slug };
  return { kind: 'not-found' };
}
