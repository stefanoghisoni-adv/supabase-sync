import type { LoaderFunctionArgs } from '@remix-run/node';

/**
 * Questo host non e' un sito: e' il backend di un'app Shopify.
 *
 * Non c'e' niente da indicizzare — nessuna pagina pubblica, e ogni rotta vive
 * dentro il riquadro dell'admin. Senza questo file i crawler continuano a
 * chiederlo, e ogni richiesta e' un'invocazione che paghiamo per rispondere
 * "non c'e'".
 */
export async function loader(_args: LoaderFunctionArgs) {
  return new Response('User-agent: *\nDisallow: /\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Un giorno: cambia praticamente mai, e non deve costare una richiesta
      // al giorno per negozio.
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
