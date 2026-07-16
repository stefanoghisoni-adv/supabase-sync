import { randomBytes, randomInt } from 'crypto';

// Set di caratteri privi di simboli ambigui (0/O/1/l/I) e sicuri per le
// stringhe di connessione Postgres.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '-_';
const CHARSET = LOWER + UPPER + DIGIT + SYMBOL;

// Sceglie un carattere con rejection sampling, per evitare il bias del modulo.
function pick(chars: string): string {
  const max = 256 - (256 % chars.length);
  let byte: number;
  do {
    byte = randomBytes(1)[0];
  } while (byte >= max);
  return chars[byte % chars.length];
}

export function generateDbPassword(length = 24): string {
  if (length < 4) throw new Error('generateDbPassword: lunghezza minima 4');
  const chars: string[] = [];
  for (let i = 0; i < length; i++) chars.push(pick(CHARSET));
  // Garantisce almeno una minuscola, una maiuscola e una cifra, in tre
  // posizioni casuali distinte (senza alterare la lunghezza).
  const positions = new Set<number>();
  while (positions.size < 3) positions.add(randomInt(length));
  const [a, b, c] = [...positions];
  chars[a] = pick(LOWER);
  chars[b] = pick(UPPER);
  chars[c] = pick(DIGIT);
  return chars.join('');
}
