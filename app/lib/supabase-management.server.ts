const MGMT_BASE = 'https://api.supabase.com';

export interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

export interface SupabaseProjectKeys {
  anon: string;
  serviceRole: string;
}

export interface SupabaseOrganization {
  id: string;
  name: string;
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`${MGMT_BASE}/v1/oauth/authorize`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', params.state);
  return url.toString();
}

async function tokenRequest(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<SupabaseTokenResponse> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${MGMT_BASE}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Supabase token error: ${res.status}`);
  return (await res.json()) as SupabaseTokenResponse;
}

export function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<SupabaseTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  return tokenRequest(body, params.clientId, params.clientSecret);
}

export function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<SupabaseTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });
  return tokenRequest(body, params.clientId, params.clientSecret);
}

export async function listProjects(accessToken: string): Promise<SupabaseProject[]> {
  const res = await fetch(`${MGMT_BASE}/v1/projects`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase list projects error: ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    organization_id: String(p.organization_id),
    region: String(p.region),
  }));
}

export async function getProjectApiKeys(
  accessToken: string,
  ref: string,
): Promise<SupabaseProjectKeys> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase api-keys error: ${res.status}`);
  const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  const serviceRole = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!anon || !serviceRole) {
    throw new Error('Supabase api-keys: anon o service_role mancante');
  }
  return { anon, serviceRole };
}

export async function runQuery(
  accessToken: string,
  ref: string,
  query: string,
): Promise<void> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Supabase query error: ${res.status}`);
}

export async function listOrganizations(
  accessToken: string,
): Promise<SupabaseOrganization[]> {
  const res = await fetch(`${MGMT_BASE}/v1/organizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase organizations error: ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map((o) => ({ id: String(o.id), name: String(o.name) }));
}

export function projectUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}
