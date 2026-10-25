import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthEnv {
  /** e.g. "yourteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** Audience (AUD) tag of the Cloudflare Access application. */
  ACCESS_AUD?: string;
  /** Local development only (set in .dev.vars). Never set this in production. */
  DEV_ALLOW_UNAUTHENTICATED?: string;
}

export type AuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Cloudflare Access sits in front of the site and handles login; this
 * re-verifies its signed token so the API stays closed even if Access is
 * misconfigured or the Worker is reached through an unprotected hostname.
 * Fails closed when Access isn't configured yet.
 */
export async function authorize(request: Request, env: AuthEnv): Promise<AuthResult> {
  if (env.DEV_ALLOW_UNAUTHENTICATED === 'true') return { ok: true };

  const team = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!team || !env.ACCESS_AUD) {
    return { ok: false, status: 503, error: 'Sync is not configured: set ACCESS_TEAM_DOMAIN and ACCESS_AUD' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, error: 'Not signed in' };

  let jwks = jwksCache.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksCache.set(team, jwks);
  }
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
    return { ok: true };
  } catch {
    return { ok: false, status: 401, error: 'Invalid session' };
  }
}
