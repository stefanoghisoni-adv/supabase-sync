import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveShopReadContext = vi.fn();
const forwardRead = vi.fn();
vi.mock('~/lib/read-proxy/context.server', () => ({
  resolveShopReadContext: (...a: unknown[]) => resolveShopReadContext(...a),
}));
vi.mock('~/lib/read-proxy/forward.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/read-proxy/forward.server')>(
    '~/lib/read-proxy/forward.server',
  );
  return {
    allowedReadTables: (c: boolean) => (c ? ['products', 'customers'] : ['products']),
    selectEmbedsForbiddenTable: actual.selectEmbedsForbiddenTable,
    forwardRead: (...a: unknown[]) => forwardRead(...a),
  };
});

import { loader } from './rest.v1.$table';

const call = (headers: Record<string, string>, table = 'products', url = 'https://app/rest/v1/products?sku=eq.X') =>
  loader({ request: new Request(url, { headers }), params: { table }, context: {} } as any);

const okCtx = (over: Record<string, unknown> = {}) => ({
  kind: 'ok',
  ctx: {
    shopId: 's1',
    authorization: 'ENABLED',
    canReadData: true,
    projectRef: 'r',
    serviceRoleKey: 'svc',
    customersEnabled: false,
    ...over,
  },
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
    resolveShopReadContext.mockResolvedValueOnce(
      okCtx({ authorization: 'PENDING', canReadData: false }),
    );
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('DISABLED → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(
      okCtx({ authorization: 'DISABLED', canReadData: false }),
    );
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  // Il gate è canReadData (fail-closed), non un confronto sulla stringa grezza:
  // uno stato non riconosciuto non deve mai concedere accesso.
  it('stato non riconosciuto → 403, nessun inoltro', async () => {
    resolveShopReadContext.mockResolvedValueOnce(
      okCtx({ authorization: 'DISABLD', canReadData: false }),
    );
    const res = await call({ authorization: 'Bearer spx_x' });
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  // PostgREST sa fare embedding di risorse collegate: senza guardia, un select
  // su una tabella ammessa esfiltrerebbe una tabella esclusa dal piano.
  it('select che embedda customers senza piano clienti → 403', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: false }));
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'products',
      'https://app/rest/v1/products?select=*,customers(*)',
    );
    expect(res.status).toBe(403);
    expect(forwardRead).not.toHaveBeenCalled();
  });

  it('select che embedda customers CON piano clienti → inoltra', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'products',
      'https://app/rest/v1/products?select=*,customers(*)',
    );
    expect(res.status).toBe(200);
    expect(forwardRead).toHaveBeenCalled();
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

  it('customers lookup mirato, cliente non consenziente → 403 e nessun inoltro dell\'originale', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    // 1a chiamata forwardRead = query di controllo consenso
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[{"accepts_marketing":false}]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?email=eq.foo@bar.com&select=*',
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("L'utente non ha acconsentito al marketing su Shopify");
    // solo la query di controllo, NON l'inoltro dell'originale
    expect(forwardRead).toHaveBeenCalledTimes(1);
  });

  it('customers lookup mirato, cliente consenziente → inoltra e restituisce i dati', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead
      .mockResolvedValueOnce({ status: 200, body: '[{"accepts_marketing":true}]', contentType: 'application/json' })
      .mockResolvedValueOnce({ status: 200, body: '[{"email":"foo@bar.com"}]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?email=eq.foo@bar.com',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('foo@bar.com');
    expect(forwardRead).toHaveBeenCalledTimes(2);
  });

  it('customers lookup mirato senza corrispondenze → inoltra (torna [])', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead
      .mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' })
      .mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    const res = await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?shopify_customer_id=eq.999',
    );
    expect(res.status).toBe(200);
    expect(forwardRead).toHaveBeenCalledTimes(2);
  });

  it('customers lettura non mirata → inoltra con accepts_marketing=eq.true', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    await call(
      { authorization: 'Bearer spx_x' },
      'customers',
      'https://app/rest/v1/customers?select=*&limit=10',
    );
    expect(forwardRead).toHaveBeenCalledTimes(1);
    const forwardedSearch = forwardRead.mock.calls[0][2] as string;
    expect(forwardedSearch).toContain('accepts_marketing=eq.true');
  });

  it('products non è toccato dal consenso', async () => {
    resolveShopReadContext.mockResolvedValueOnce(okCtx({ customersEnabled: true }));
    forwardRead.mockResolvedValueOnce({ status: 200, body: '[]', contentType: 'application/json' });
    await call(
      { authorization: 'Bearer spx_x' },
      'products',
      'https://app/rest/v1/products?email=eq.foo@bar.com',
    );
    expect(forwardRead).toHaveBeenCalledTimes(1);
    const forwardedSearch = forwardRead.mock.calls[0][2] as string;
    expect(forwardedSearch).not.toContain('accepts_marketing');
  });
});
