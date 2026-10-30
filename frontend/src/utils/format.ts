export function formatGEX(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
  return val.toLocaleString();
}

export function formatPct(val: number, digits = 1): string {
  return `${(val * 100).toFixed(digits)}%`;
}

export function formatMoney(val: number, digits = 2): string {
  return `$${val.toFixed(digits)}`;
}
