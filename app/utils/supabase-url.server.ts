/**
 * Validates a merchant-supplied Supabase project URL to prevent SSRF.
 *
 * A merchant configures their own Supabase URL, and that value is later used to
 * send the decrypted service-role key (via fetch / createClient). Without
 * validation a merchant could point the URL at an internal or attacker-controlled
 * host and exfiltrate the key. We therefore only accept the canonical Supabase
 * hosted form: https://<project-ref>.supabase.co
 *
 * Restricting the host to `*.supabase.co` over https also rejects private /
 * loopback IPs, non-https schemes, ports, and arbitrary hosts by construction.
 */

// Supabase project refs are 20 lowercase alphanumeric characters.
const SUPABASE_HOST_RE = /^[a-z0-9]{20}\.supabase\.co$/;

export interface SupabaseUrlValidation {
  ok: boolean;
  /** Normalized origin (no trailing slash, no path) when ok. */
  url?: string;
  error?: string;
}

export function validateSupabaseUrl(raw: unknown): SupabaseUrlValidation {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'Supabase URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Invalid Supabase URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Supabase URL must use https' };
  }

  if (parsed.port !== '') {
    return { ok: false, error: 'Supabase URL must not specify a port' };
  }

  if (!SUPABASE_HOST_RE.test(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Supabase URL must be a canonical https://<project-ref>.supabase.co address',
    };
  }

  // Return a clean origin so downstream callers never carry an attacker-supplied
  // path, query, or credentials segment.
  return { ok: true, url: `https://${parsed.hostname}` };
}
