// The four run steps as Home and the header show them. Step 2 reads "Public
// registers" once a register other than Companies House is connected.

const OTHER_REGISTERS = new Set<string>([]);

export function stepLabels(connectors: string[]): [string, string, string, string] {
  const second = connectors.some((c) => OTHER_REGISTERS.has(c)) ? "Public registers" : "Other sources";
  return ["Companies House", second, "AI review", "Saving"];
}
