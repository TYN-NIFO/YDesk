const cache = new Map<string, { rate: number; timestamp: number }>();

export async function getHistoricalRate(currency: string, date?: string): Promise<number> {
  if (currency === 'INR') return 1;
  const key = `${currency}_${date || 'latest'}`;
  const existing = cache.get(key);
  if (existing && Date.now() - existing.timestamp < 3600000) return existing.rate;
  const response = await fetch(`https://api.frankfurter.dev/v1/${date || 'latest'}?base=${encodeURIComponent(currency)}&symbols=INR`);
  if (!response.ok) throw new Error('Exchange rates are unavailable');
  const data = await response.json();
  if (!(data.rates?.INR > 0)) throw new Error('Invalid exchange rate');
  cache.set(key, { rate: data.rates.INR, timestamp: Date.now() });
  return data.rates.INR;
}

export async function convertToINR(amount: number, currency: string, date?: string) {
  const rate = await getHistoricalRate(currency, date);
  return { inr: Math.round(amount * rate * 100) / 100, rate, date: date || new Date().toISOString().slice(0, 10) };
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}
