import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveShopReadContext = vi.fn();
const forwardRead = vi.fn();
vi.mock('~/lib/read-proxy/context.server', () => ({
  resolveShopReadContext: (...a: unknown[]) => resolveShopReadContext(...a),
}));
vi.mock('~/lib/read-proxy/forward.server', () => ({
  allowedReadTables: (c: boolean) => (c ? ['products', 'customers'] : ['products']),
  forwardRead: (...a: unknown[]) => forwardRead(...a),
}));

import { loader } from './rest.v1.$table';

const call = (headers: Record<string, string>, table = 'products', url = 'https://app/rest/v1/products?sku=eq.X') =>
  loader({ request: new Request(url, { headers }), params: { table }, context: {} } as any);

const okCtx = (over: Record<string, unknown> = {}) => ({
  kind: 'ok',
  ctx: { shopId: 's1', authorization: 'ENABLED', projectRef: 'r', serviceRoleKey: 'svc', customersEnabled: false, ...over },
});

describe('proxy loader', () => {
  beforeEach(() => {
    resolveShopReadContext.mockReset();
    forwardRead.mockReset();
  });

  it('token mancante → 401', async () => {
    const res = await call({});
    expect(res.status).toBe(401);
  });

  it('token sconosciuto → 401', async () => {
    resolveShopReadContext.mockResolvedValueOnce({ kind: 'unknown' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(401);
  });

  it('non collegato → 409', async () => {
    resolveShopReadContext.mockResolvedValueOnce({ kind: 'not_configured' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(409);
  });

  it('PENDING → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ authorization: 'PENDING' }));
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('DISABLED → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ authorization: 'DISABLED' }));
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('tabella non ammessa dal piano → 403', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: false }));
    const res = await call({ authorization: 'Bearer spx_x' }, 'customers', 'https://app/rest/v1/customers');
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('ENABLED + tabella ok → inoltra e propaga status/body', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx());
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[{"id":1}]', contentType: 'application/json' });
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"id":1}]');
    const [, table, search] = forwardRead.mock.calls[0];
    expect(table).toBe('products');
    expect(search).toBe('?sku=eq.X');
  });
});
