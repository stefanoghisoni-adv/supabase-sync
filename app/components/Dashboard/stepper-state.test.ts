import { describe, it, expect } from 'vitest';
import { resolveStepStates } from './stepper-state';

describe('resolveStepStates', () => {
  it('locks sync and activates connect when not connected', () => {
    expect(resolveStepStates(false)).toEqual({
      connectSupabase: 'active',
      sync: 'locked',
    });
  });
  it('completes connect and activates sync when connected', () => {
    expect(resolveStepStates(true)).toEqual({
      connectSupabase: 'complete',
      sync: 'active',
    });
  });
});
