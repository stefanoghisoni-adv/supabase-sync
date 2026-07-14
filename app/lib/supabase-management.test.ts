import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCode,
  listProjects,
  getProjectApiKeys,
  projectUrl,
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
        { id: 'ref1', name: 'P1', organization_id: 'org1', region: 'eu-central-1', extra: 'x' },
      ],
    });
    const projects = await listProjects('tok');
    expect(projects).toEqual([{ id: 'ref1', name: 'P1', organization_id: 'org1', region: 'eu-central-1' }]);
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

describe('projectUrl', () => {
  it('derives the project URL from the ref', () => {
    expect(projectUrl('abcd')).toBe('https://abcd.supabase.co');
  });
});
