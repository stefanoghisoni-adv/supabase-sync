export type StepState = 'complete' | 'active' | 'locked';

export interface DashboardStepStates {
  connectSupabase: StepState;
  sync: StepState;
}

export function resolveStepStates(
  supabaseConnected: boolean,
): DashboardStepStates {
  return supabaseConnected
    ? { connectSupabase: 'complete', sync: 'active' }
    : { connectSupabase: 'active', sync: 'locked' };
}
