import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({
  prisma: { plan: { findFirst: vi.fn() } },
}));

import { findPlanByName, findFreePlan, freePlanName } from './find-plan.server';
import { prisma } from '~/db.server';

describe('findFreePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cerca il piano a prezzo zero, il piu vecchio se ce n e piu d uno', async () => {
    (prisma.plan.findFirst as any).mockResolvedValue({ planName: 'Free' });

    expect(await findFreePlan()).toEqual({ planName: 'Free' });
    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { priceMonthly: 0 },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('freePlanName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restituisce il nome esatto che sta nel listino', async () => {
    (prisma.plan.findFirst as any).mockResolvedValue({ planName: 'Gratuito' });
    expect(await freePlanName()).toBe('Gratuito');
  });

  it('listino senza piano gratuito → ripiego, ma con un errore nei log', async () => {
    // Non deve far fallire un'installazione. Se il nome di ripiego e' sbagliato
    // ci pensa la foreign key su shops.current_plan a rifiutarlo.
    (prisma.plan.findFirst as any).mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await freePlanName()).toBe('Free');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('findPlanByName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.plan.findFirst as any).mockResolvedValue({ planName: 'Pro' });
  });

  it('cerca senza distinguere maiuscole e minuscole', async () => {
    const plan = await findPlanByName('pro');

    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { planName: { equals: 'pro', mode: 'insensitive' } },
    });
    expect(plan).toEqual({ planName: 'Pro' });
  });

  it('toglie gli spazi ai bordi', async () => {
    await findPlanByName('  Business  ');

    expect(prisma.plan.findFirst).toHaveBeenCalledWith({
      where: { planName: { equals: 'Business', mode: 'insensitive' } },
    });
  });

  it('nome assente o vuoto → null senza interrogare il database', async () => {
    expect(await findPlanByName(null)).toBeNull();
    expect(await findPlanByName(undefined)).toBeNull();
    expect(await findPlanByName('   ')).toBeNull();
    expect(prisma.plan.findFirst).not.toHaveBeenCalled();
  });

  it('nome fuori dal listino → null', async () => {
    (prisma.plan.findFirst as any).mockResolvedValue(null);
    expect(await findPlanByName('inesistente')).toBeNull();
  });
});
