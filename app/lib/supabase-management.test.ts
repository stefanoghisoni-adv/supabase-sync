import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCode,
  listProjects,
  getProjectApiKeys,
  listOrganizations,
  projectUrl,
  listRegions,
  createProject,
  getProject,
  resetDbPassword,
  countsTowardsPlanLimit,
  organizationBillingUrl,
  getOrganizationPlan,
  SUPABASE_PLAN_PROJECT_LIMITS,
} from './supabase-management.server';

global.fetch = vi.fn();

describe('buildAuthorizeUrl', () => {
  it('builds the authorize URL with required params', () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://app/cb', state: 'st' })
    );
    expect(url.origin + url.pathname).toBe('https://api.supabase.com/v1/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('st');
  });
});

describe('exchangeCode', () => {
  it('POSTs form body with Basic auth and parses the token response', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'Bearer' }),
    });
    const res = await exchangeCode({ code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app/cb' });
    expect(res.access_token).toBe('a');
    expect(res.refresh_token).toBe('r');
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.supabase.com/v1/oauth/token');
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from('cid:sec').toString('base64'));
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=c');
  });
});

describe('listProjects', () => {
  it('maps the raw projects to the trimmed shape', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'ref1',
          name: 'P1',
          organization_id: 'org1',
          organization_slug: 'slug1',
          region: 'eu-central-1',
          status: 'ACTIVE_HEALTHY',
          extra: 'x',
        },
      ],
    });
    const projects = await listProjects('tok');
    expect(projects).toEqual([
      {
        id: 'ref1',
        name: 'P1',
        organization_id: 'org1',
        organization_slug: 'slug1',
        region: 'eu-central-1',
        status: 'ACTIVE_HEALTHY',
      },
    ]);
  });

  it('ripiega su organization_id se lo slug manca, e su UNKNOWN se manca lo status', async () => {
    // Risposte piu' vecchie della Management API non hanno organization_slug:
    // senza fallback l'URL di billing verrebbe costruito su "undefined".
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'ref1', name: 'P1', organization_id: 'org1', region: 'eu-central-1' },
      ],
    });
    const [project] = await listProjects('tok');
    expect(project.organization_slug).toBe('org1');
    expect(project.status).toBe('UNKNOWN');
  });
});

describe('getProjectApiKeys', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('extracts anon and service_role keys', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'anon', api_key: 'anon-key' },
        { name: 'service_role', api_key: 'service-key' },
      ],
    });
    const keys = await getProjectApiKeys('tok', 'ref1');
    expect(keys).toEqual({ anon: 'anon-key', serviceRole: 'service-key' });
  });

  it('throws when a required key is missing', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ name: 'anon', api_key: 'anon-key' }],
    });
    await expect(getProjectApiKeys('tok', 'ref1')).rejects.toThrow();
  });
});

describe('listOrganizations', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('GET /v1/organizations e mappa id/name', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'org1', name: 'Stefano Ghisoni', extra: 1 }],
    });
    const orgs = await listOrganizations('tok');
    expect(orgs).toEqual([{ id: 'org1', name: 'Stefano Ghisoni' }]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/organizations');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('lancia in errore su risposta non ok', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(listOrganizations('tok')).rejects.toThrow();
  });
});

describe('projectUrl', () => {
  it('derives the project URL from the ref', () => {
    expect(projectUrl('abcd')).toBe('https://abcd.supabase.co');
  });
});

describe('listRegions', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('ritorna la lista di fallback se l\'endpoint dinamico fallisce', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    const regions = await listRegions('tok');
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.every((r) => typeof r.id === 'string' && typeof r.name === 'string')).toBe(true);
    // deve contenere una region UE di default
    expect(regions.some((r) => r.id === 'eu-central-1')).toBe(true);
  });
});

describe('createProject', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('POST /v1/projects con body corretto e ritorna il ref', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'newref123', name: 'My Project' }),
    });
    const res = await createProject('tok', {
      name: 'My Project',
      organizationId: 'org1',
      region: 'eu-central-1',
      dbPass: 'Secret-123',
    });
    expect(res).toEqual({ ref: 'newref123' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('My Project');
    expect(body.organization_id).toBe('org1');
    expect(body.region).toBe('eu-central-1');
    expect(body.db_pass).toBe('Secret-123');
  });

  it('lancia in errore su risposta non ok (incl. 403 scope insufficiente)', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      createProject('tok', { name: 'x', organizationId: 'o', region: 'eu-central-1', dbPass: 'p' }),
    ).rejects.toThrow('403');
  });
});

describe('getProject', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('GET /v1/projects/{ref} e ritorna lo status', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'r1', status: 'ACTIVE_HEALTHY' }),
    });
    const res = await getProject('tok', 'r1');
    expect(res.status).toBe('ACTIVE_HEALTHY');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects/r1');
  });
});

describe('resetDbPassword', () => {
  beforeEach(() => (global.fetch as any).mockReset());

  it('invia la nuova password al progetto e risolve su ok', async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(resetDbPassword('tok', 'r1', 'NewPass-9')).resolves.toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('https://api.supabase.com/v1/projects/r1');
    expect(String(init.body)).toContain('NewPass-9');
  });

  it('segnala unsupported su 404', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(resetDbPassword('tok', 'r1', 'p')).rejects.toThrow('unsupported');
  });
});

describe('limiti di progetto per piano', () => {
  beforeEach(() => {
    (global.fetch as any).mockReset();
  });

  it('il piano Free consente 2 progetti, i piani a pagamento non hanno un limite da far rispettare', () => {
    expect(SUPABASE_PLAN_PROJECT_LIMITS.free).toBe(2);
    expect(SUPABASE_PLAN_PROJECT_LIMITS.pro).toBeNull();
    expect(SUPABASE_PLAN_PROJECT_LIMITS.team).toBeNull();
  });

  it('i progetti in pausa o rimossi non occupano uno slot del piano', () => {
    // Supabase e' esplicito: i progetti in pausa non contano verso il limite Free.
    expect(countsTowardsPlanLimit('INACTIVE')).toBe(false);
    expect(countsTowardsPlanLimit('REMOVED')).toBe(false);
    expect(countsTowardsPlanLimit('PAUSING')).toBe(false);
    expect(countsTowardsPlanLimit('GOING_DOWN')).toBe(false);
  });

  it('i progetti attivi o in avvio occupano uno slot', () => {
    expect(countsTowardsPlanLimit('ACTIVE_HEALTHY')).toBe(true);
    expect(countsTowardsPlanLimit('ACTIVE_UNHEALTHY')).toBe(true);
    expect(countsTowardsPlanLimit('COMING_UP')).toBe(true);
    expect(countsTowardsPlanLimit('RESTORING')).toBe(true);
  });

  it('costruisce l’URL di billing dallo slug dell’organizzazione', () => {
    expect(organizationBillingUrl('abcdefghijklmnopqrst')).toBe(
      'https://supabase.com/dashboard/org/abcdefghijklmnopqrst/billing',
    );
  });

  it('legge il piano dell’organizzazione', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'o1', name: 'Org', plan: 'free' }),
    } as Response);

    await expect(getOrganizationPlan('tok', 'slug')).resolves.toBe('free');
  });

  it('ritorna null se lo scope Organizations non e’ concesso (403)', async () => {
    // Senza il piano il chiamante NON deve dedurre un limite: meglio lasciar
    // provare la creazione che bloccarla su un limite non verificabile.
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    await expect(getOrganizationPlan('tok', 'slug')).resolves.toBeNull();
  });

  it('ritorna null su un piano sconosciuto invece di propagarlo', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plan: 'piano_inventato' }),
    } as Response);

    await expect(getOrganizationPlan('tok', 'slug')).resolves.toBeNull();
  });
});
