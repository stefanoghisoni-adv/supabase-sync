import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
  test: {
    globals: true,
    // Il pool a thread (default) fa crashare il processo con SIGSEGV a suite
    // completa, in modo intermittente: i singoli file passano, ma il runner muore
    // prima di stampare il riepilogo, lasciando un conteggio PARZIALE che sembra
    // una regressione. Con i processi separati la suite e' stabile.
    pool: 'forks',
  },
});
