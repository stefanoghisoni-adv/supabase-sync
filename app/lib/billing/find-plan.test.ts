import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/db.server', () => ({
  prisma: { plan: { findFirst: vi.fn() } },
}));

import { findPlanByName } from './find-plan.server';
import { prisma } from '~/db.server';

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
