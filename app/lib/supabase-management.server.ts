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

export interface SupabaseCreateProjectResult {
  ref: string;
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

export interface SupabaseRegion {
  id: string;
  name: string;
}

// Lista ufficiale corrente (fallback). Ordine con UE in cima come default sensato.
export const SUPABASE_REGIONS: SupabaseRegion[] = [
  { id: 'eu-central-1', name: 'Central EU (Frankfurt)' },
  { id: 'eu-west-1', name: 'West EU (Ireland)' },
  { id: 'eu-west-2', name: 'West EU (London)' },
  { id: 'eu-west-3', name: 'West EU (Paris)' },
  { id: 'us-east-1', name: 'East US (North Virginia)' },
  { id: 'us-west-1', name: 'West US (North California)' },
  { id: 'us-east-2', name: 'East US (Ohio)' },
  { id: 'ap-southeast-1', name: 'Southeast Asia (Singapore)' },
  { id: 'ap-northeast-1', name: 'Northeast Asia (Tokyo)' },
  { id: 'ap-south-1', name: 'South Asia (Mumbai)' },
  { id: 'sa-east-1', name: 'South America (São Paulo)' },
  { id: 'ca-central-1', name: 'Canada (Central)' },
];

// Tenta un endpoint dinamico; se non disponibile, usa la lista di fallback.
// NOTA IMPLEMENTAZIONE: verificare se la Management API espone un endpoint
// "available regions". Se sì, sostituire il path e il parsing qui; il fallback
// garantisce comunque il funzionamento.
export async function listRegions(accessToken: string): Promise<SupabaseRegion[]> {
  try {
    const res = await fetch(`${MGMT_BASE}/v1/projects/available-regions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return SUPABASE_REGIONS;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) return SUPABASE_REGIONS;
    return data.map((r) => ({ id: String(r.id ?? r.region), name: String(r.name ?? r.id) }));
  } catch {
    return SUPABASE_REGIONS;
  }
}

export async function createProject(
  accessToken: string,
  params: { name: string; organizationId: string; region: string; dbPass: string },
): Promise<SupabaseCreateProjectResult> {
  const res = await fetch(`${MGMT_BASE}/v1/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      organization_id: params.organizationId,
      region: params.region,
      db_pass: params.dbPass,
    }),
  });
  if (!res.ok) throw new Error(`Supabase create project error: ${res.status}`);
  const data = (await res.json()) as { id?: unknown; ref?: unknown };
  const ref = String(data.id ?? data.ref);
  return { ref };
}

export async function getProject(
  accessToken: string,
  ref: string,
): Promise<{ status: string }> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase get project error: ${res.status}`);
  const data = (await res.json()) as { status?: unknown };
  return { status: String(data.status ?? 'UNKNOWN') };
}

export async function resetDbPassword(
  accessToken: string,
  ref: string,
  newPass: string,
): Promise<void> {
  const res = await fetch(`${MGMT_BASE}/v1/projects/${ref}/config/database`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPass }),
  });
  if (res.status === 404 || res.status === 405) {
    throw new Error('unsupported: reset db password non disponibile');
  }
  if (!res.ok) throw new Error(`Supabase reset password error: ${res.status}`);
}
