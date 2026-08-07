export function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable not configured');
  }

  return redisUrl;
}

/**
 * Se la connessione va cifrata.
 *
 * `rediss://` lo dichiara, ed e' il caso normale. Ma Upstash accetta **solo**
 * connessioni cifrate: un indirizzo `redis://` verso di loro non puo' funzionare
 * in nessun caso, e vale la pena correggerlo invece di rispettarlo alla lettera.
 *
 * Il motivo e' il sintomo: senza TLS il server chiude e basta, e ioredis riporta
 * "read ECONNRESET", poi "stream isn't writeable", poi "max retries". Nessuno di
 * questi messaggi nomina il TLS ne' suggerisce che all'indirizzo manchi una `s`,
 * e la cosa somiglia in tutto a un servizio irraggiungibile. Ci e' costato un
 * pomeriggio di diagnosi su una lettera.
 */
export function needsTls(url: URL): boolean {
  return url.protocol === 'rediss:' || url.hostname.endsWith('.upstash.io');
}

/** Opzioni di connessione comuni a tutti i client Redis dell'app. */
export function redisConnectionOptions() {
  const url = new URL(getRedisUrl());
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== '/' ? parseInt(url.pathname.slice(1), 10) : 0,
    tls: needsTls(url) ? {} : undefined,
    lazyConnect: true,
  };
}
