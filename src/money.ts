export function safe(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Amount exceeds the supported safe monetary range");
  }
  return Number(value);
}
export function sum(values: number[]): number {
  return safe(values.reduce((total, value) => total + BigInt(value), 0n));
}
export function parseMoney(input: string): number {
  const value = input.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Enter money with at most two decimal places");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return safe(
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
      (negative ? -1n : 1n),
  );
}
export function decimal(value: number): string {
  const v = BigInt(value);
  const abs = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
export function formatMoney(value: number, currency = "KES"): string {
  const [whole, fraction] = decimal(value).split(".");
  const sign = value < 0 ? "-" : "";
  const grouped = new Intl.NumberFormat("en-KE", {
    maximumFractionDigits: 0,
  }).format(BigInt(whole.replace("-", "")));
  return `${sign}${currency} ${grouped}.${fraction}`;
}
export function ratio(
  amount: number,
  numerator: number,
  denominator = 10000,
): number {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    throw new Error("Invalid calculation ratio");
  }
  const product = BigInt(amount) * BigInt(numerator);
  const sign = product < 0n ? -1n : 1n;
  const abs = product < 0n ? -product : product;
  return safe(
    sign * ((abs + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)),
  );
}
export const floorDivide = (amount: number, divisor: number) =>
  safe(BigInt(amount) / BigInt(divisor));
