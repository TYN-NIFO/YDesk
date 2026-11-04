let cachedRates;
let cachedAt = 0;

export async function exchangeRates(policy) {
  const configured = policy.exchangeRates || {};
  if (configured.USD > 0 && configured.EUR > 0) return { ...configured, INR: 1 };
  if (cachedRates && Date.now() - cachedAt < 3600000) return cachedRates;
  const response = await fetch('https://api.frankfurter.dev/v1/latest?base=INR&symbols=USD,EUR', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Exchange rates are unavailable. Retry or submit amounts in INR.');
  const data = await response.json();
  if (!(data.rates?.USD > 0) || !(data.rates?.EUR > 0)) throw new Error('Invalid exchange rate response');
  cachedRates = { INR: 1, USD: 1 / data.rates.USD, EUR: 1 / data.rates.EUR };
  cachedAt = Date.now();
  return cachedRates;
}
