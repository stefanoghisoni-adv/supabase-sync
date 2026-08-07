import { describe, it, expect } from 'vitest';
import { needsTls } from './connection.server';

describe('needsTls', () => {
  it('cifra quando l indirizzo lo dichiara', () => {
    expect(needsTls(new URL('rediss://default:pw@qualsiasi.host:6379'))).toBe(true);
  });

  it('cifra comunque verso Upstash, anche se l indirizzo dice redis://', () => {
    // Upstash accetta solo connessioni cifrate: un redis:// verso di loro non
    // puo' funzionare in nessun caso. Rispettarlo alla lettera significherebbe
    // solo produrre un ECONNRESET che non nomina mai il TLS — e' costato un
    // pomeriggio di diagnosi su una lettera mancante.
    expect(needsTls(new URL('redis://default:pw@real-grizzly-181507.upstash.io:6379'))).toBe(true);
  });

  it('non cifra in locale', () => {
    // Il Redis di sviluppo gira in chiaro: forzare il TLS renderebbe
    // impossibile lavorare sulla propria macchina.
    expect(needsTls(new URL('redis://localhost:6379'))).toBe(false);
  });

  it('non cifra verso un altro fornitore che non lo dichiara', () => {
    // La correzione vale solo dove sappiamo per certo che il TLS e' obbligatorio.
    // Altrove si rispetta quello che dice l'indirizzo.
    expect(needsTls(new URL('redis://cache.interno.example.com:6379'))).toBe(false);
  });

  it('non si fa ingannare da un host che contiene upstash.io senza esserlo', () => {
    // Il confronto e' sulla fine dell'host, non su "contiene": altrimenti
    // upstash.io.malintenzionato.com passerebbe per Upstash.
    expect(needsTls(new URL('redis://upstash.io.altrodominio.com:6379'))).toBe(false);
  });
});
