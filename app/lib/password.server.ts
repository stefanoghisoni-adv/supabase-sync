import { randomBytes } from 'crypto';

// Charset senza caratteri ambigui e sicuro per stringhe di connessione Postgres.
const CHARSET =
  'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';

export function generateDbPassword(length = 24): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  // Garantisce almeno una minuscola, una maiuscola e una cifra.
  if (!/[a-z]/.test(out)) out = 'a' + out.slice(1);
  if (!/[A-Z]/.test(out)) out = out.slice(0, 1) + 'A' + out.slice(2);
  if (!/[0-9]/.test(out)) out = out.slice(0, 2) + '2' + out.slice(3);
  return out;
}
