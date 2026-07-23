export interface ProblemRowPresentation {
  tone: 'warning' | undefined;
  showLink: boolean;
}

// La riga "Non idonei" e' arancione e offre il link ai dettagli solo se c'e'
// davvero qualcosa da correggere; a zero problemi resta grigia e muta.
export function problemRowPresentation(problemCount: number): ProblemRowPresentation {
  const hasProblems = problemCount > 0;
  return { tone: hasProblems ? 'warning' : undefined, showLink: hasProblems };
}
