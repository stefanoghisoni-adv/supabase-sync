import type { LoaderFunctionArgs } from '@remix-run/node';

/**
 * Tutto quello che non e' una rotta dell'app.
 *
 * Senza, Remix registra un errore con lo stack completo per ogni indirizzo
 * inesistente: i registri si riempiono di "No route matches URL" e un guasto
 * vero diventa difficile da vedere in mezzo. Non e' un caso raro — un dominio
 * pubblico riceve scansioni continue, che provano /contact, /pricing e i nomi
 * dei kit di phishing in cerca di siti gia' compromessi.
 *
 * Qui rispondono tutte con un 404 asciutto, senza rumore.
 */
export async function loader(_args: LoaderFunctionArgs) {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default function NotFound() {
  return null;
}
