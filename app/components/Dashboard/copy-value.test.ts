import { describe, it, expect, vi, afterEach } from 'vitest';
import { middleTruncate, copyToClipboard } from './copy-value';

// Ambiente node: niente navigator ne' document, li mettiamo noi caso per caso.
function fakeDocument(execCommand: () => boolean) {
  const field = {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
  };
  return {
    field,
    doc: {
      createElement: vi.fn(() => field),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      getSelection: vi.fn(() => null),
      execCommand: vi.fn(execCommand),
    },
  };
}

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('appunti disponibili → copia e conferma', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyToClipboard('spx_abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('spx_abc');
  });

  it('permesso negato → ripiega sulla selezione', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    });
    const { doc, field } = fakeDocument(() => true);
    vi.stubGlobal('document', doc);

    await expect(copyToClipboard('spx_abc')).resolves.toBe(true);
    // Il valore copiato e' quello intero, non quello accorciato a schermo.
    expect(field.value).toBe('spx_abc');
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
    expect(doc.body.removeChild).toHaveBeenCalled();
  });

  it('nessuna delle due strade → nessuna conferma', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });
    const { doc } = fakeDocument(() => false);
    vi.stubGlobal('document', doc);

    await expect(copyToClipboard('spx_abc')).resolves.toBe(false);
  });
});

describe('middleTruncate', () => {
  it('valore corto → invariato', () => {
    expect(middleTruncate('supabase-sync.vercel.app')).toBe('supabase-sync.vercel.app');
  });

  it('esattamente al limite → invariato', () => {
    expect(middleTruncate('abcdefghij', 10)).toBe('abcdefghij');
  });

  it('oltre il limite → taglio al centro, lunghezza rispettata', () => {
    const out = middleTruncate('abcdefghijklmnopqrst', 11);
    expect(out).toBe('abcde…pqrst');
    expect(out.length).toBeLessThanOrEqual(11);
  });

  it("la coda resta visibile: e' quella che distingue due chiavi simili", () => {
    const a = middleTruncate(`spx_${'a'.repeat(40)}FINE1`, 20);
    const b = middleTruncate(`spx_${'a'.repeat(40)}FINE2`, 20);
    expect(a).not.toBe(b);
  });

  it('limite assurdo → nessun taglio, meglio il valore intero', () => {
    expect(middleTruncate('abcdefgh', 3)).toBe('abcdefgh');
  });
});
