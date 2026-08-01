/**
 * Nome da far digitare prima di cancellare tabelle e dati.
 *
 * E' il riferimento del progetto: quello che il merchant si vede scritto nella
 * card del collegamento e dentro l'URL. Se per qualche ragione non fosse noto
 * si ricava dall'URL stesso, che in stato collegato c'e' sempre.
 */
export function projectConfirmationName(opts: {
  projectName?: string;
  projectUrl?: string;
}): string | null {
  const name = opts.projectName?.trim();
  if (name) return name;

  const url = opts.projectUrl?.trim();
  if (!url) return null;
  try {
    // https://<ref>.supabase.co → <ref>
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

/**
 * Il nome digitato corrisponde? Spazi ai lati e maiuscole non contano: la
 * conferma serve a fermare un clic distratto, non a mettere alla prova la
 * tastiera di chi ha gia' deciso.
 */
export function matchesProjectName(input: string, expected: string): boolean {
  const typed = input.trim().toLowerCase();
  if (!typed) return false;
  return typed === expected.trim().toLowerCase();
}
