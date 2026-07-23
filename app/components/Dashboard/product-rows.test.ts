import { describe, it, expect } from 'vitest';
import { problemRowPresentation } from './product-rows';

describe('problemRowPresentation', () => {
  it('con problemi → badge arancione e link visibile', () => {
    expect(problemRowPresentation(3)).toEqual({ tone: 'warning', showLink: true });
  });
  it('senza problemi → badge grigio e nessun link', () => {
    expect(problemRowPresentation(0)).toEqual({ tone: undefined, showLink: false });
  });
});
