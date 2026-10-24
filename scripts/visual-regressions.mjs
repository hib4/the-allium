/** Compare every selected variant with Current, independent of selection order. */
export function compareRegressions(results) {
  return ["webgl", "canvas"].flatMap((backend) => {
    const rows = results.filter((r) => r.requestedBackend === backend);
    const baseline = rows.find((r) => r.variant === "current");
    if (!baseline) return [];
    return rows
      .filter((r) => r.variant !== "current")
      .map((row) => ({
        backend,
        variant: row.variant,
        baseline: "current",
        p95Ratio: row.p95 / baseline.p95,
        withinTenPercent: row.p95 <= baseline.p95 * 1.1,
      }));
  });
}
