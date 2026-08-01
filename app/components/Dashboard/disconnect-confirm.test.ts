import { describe, it, expect } from 'vitest';
import { projectConfirmationName, matchesProjectName } from './disconnect-confirm';

describe('projectConfirmationName', () => {
  it('usa il riferimento del progetto', () => {
    expect(
      projectConfirmationName({ projectName: 'lturddtuwwpiczafexsj' }),
    ).toBe('lturddtuwwpiczafexsj');
  });

  it('senza riferimento lo ricava dall\'URL', () => {
    expect(
      projectConfirmationName({ projectUrl: 'https://lturddtuwwpiczafexsj.supabase.co' }),
    ).toBe('lturddtuwwpiczafexsj');
  });

  it('il riferimento vince sull\'URL', () => {
    expect(
      projectConfirmationName({
        projectName: 'nome-scelto',
        projectUrl: 'https://abc.supabase.co',
      }),
    ).toBe('nome-scelto');
  });

  it('niente da chiedere → null', () => {
    expect(projectConfirmationName({})).toBeNull();
    expect(projectConfirmationName({ projectName: '   ' })).toBeNull();
    expect(projectConfirmationName({ projectUrl: 'non-un-url' })).toBeNull();
  });
});

describe('matchesProjectName', () => {
  const expected = 'lturddtuwwpiczafexsj';

  it('nome esatto → procede', () => {
    expect(matchesProjectName(expected, expected)).toBe(true);
  });

  it('spazi ai lati e maiuscole non contano', () => {
    expect(matchesProjectName('  LTURDDTUWWPICZAFEXSJ ', expected)).toBe(true);
  });

  it('nome diverso o incompleto → non procede', () => {
    expect(matchesProjectName('lturddtuwwpiczafex', expected)).toBe(false);
    expect(matchesProjectName('altro-progetto', expected)).toBe(false);
  });

  it('campo vuoto → non procede', () => {
    // Senza questo controllo un atteso vuoto renderebbe valido un campo vuoto.
    expect(matchesProjectName('', expected)).toBe(false);
    expect(matchesProjectName('   ', '   ')).toBe(false);
  });
});
