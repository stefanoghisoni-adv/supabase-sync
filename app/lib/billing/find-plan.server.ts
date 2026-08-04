import type { Plan } from '@prisma/client';
import { prisma } from '~/db.server';

// Il nome del piano viaggia in due posti che non si aggiornano insieme: la
// colonna `plans.plan_name` (il listino) e `shops.current_plan` (quello scritto
// sul negozio al momento dell'attivazione). Basta rinominare un piano nel
// listino — anche solo cambiando un'iniziale maiuscola — perche' i due smettano
// di combaciare, e un confronto esatto restituirebbe null.
//
// Un null qui non e' innocuo: chi legge il piano ricade su valori di comodo
// (`maxProducts` assente vale "illimitato", `customersSyncEnabled` vale false),
// quindi un piano non trovato toglie il tetto ai prodotti e spegne la sync dei
// clienti senza dire niente a nessuno. Per questo la ricerca passa sempre di
// qui, insensibile a maiuscole e spazi.

/**
 * Il piano con questo nome, confronto insensibile a maiuscole/minuscole e spazi
 * ai bordi. Null se il nome e' vuoto o non c'e' nel listino.
 */
export async function findPlanByName(
  name: string | null | undefined,
): Promise<Plan | null> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return null;

  // findFirst e non findUnique: il confronto insensibile a maiuscole richiede
  // `mode: 'insensitive'`, che Prisma accetta solo sulle query non-unique.
  return prisma.plan.findFirst({
    where: { planName: { equals: trimmed, mode: 'insensitive' } },
  });
}
