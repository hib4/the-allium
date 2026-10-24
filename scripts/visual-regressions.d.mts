export interface ComparisonSample {
  variant: string;
  requestedBackend: string;
  p95: number;
}
export interface VisualRegression {
  backend: string;
  variant: string;
  baseline: string;
  p95Ratio: number;
  withinTenPercent: boolean;
}
export function compareRegressions(
  results: readonly ComparisonSample[],
): VisualRegression[];
