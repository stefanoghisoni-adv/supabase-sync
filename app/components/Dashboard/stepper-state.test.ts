import { describe, it, expect } from 'vitest';
import { resolveStepStates } from './stepper-state';

describe('resolveStepStates', () => {
  it('niente di fatto: si parte dall accesso, il resto e bloccato', () => {
    expect(resolveStepStates(false, false)).toEqual({
      connectAccount: 'active',
      connectDatabase: 'locked',
      sync: 'locked',
    });
  });

  it('account collegato: tocca al database, la sync resta bloccata', () => {
    expect(resolveStepStates(true, false)).toEqual({
      connectAccount: 'complete',
      connectDatabase: 'active',
      sync: 'locked',
    });
  });

  it('database collegato: primi due conclusi, si puo sincronizzare', () => {
    expect(resolveStepStates(true, true)).toEqual({
      connectAccount: 'complete',
      connectDatabase: 'complete',
      sync: 'active',
    });
  });

  it('database collegato senza account: vale il passo piu avanti', () => {
    // Non dovrebbe capitare, ma se capita e' meglio non far sembrare il flusso
    // tornato indietro di un passo.
    expect(resolveStepStates(false, true)).toEqual({
      connectAccount: 'complete',
      connectDatabase: 'complete',
      sync: 'active',
    });
  });
});
