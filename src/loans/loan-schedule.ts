/**
 * Pure loan maths. No framework code here, so it is trivial to unit test.
 */

/**
 * Flat interest in whole francs, rounded half up.
 * The rate is converted to basis points so the arithmetic stays in integers:
 * 33,333 at 5% is 33,333 x 500 / 10,000 = 1,666.65, which rounds to 1,667.
 */
export function flatInterest(principal: number, ratePercent: number): number {
  const basisPoints = Math.round(ratePercent * 100);

  return Math.floor((principal * basisPoints + 5_000) / 10_000);
}

/**
 * Split a total into `parts` whole amounts that differ by at most 1, larger ones first.
 * splitAmount(110000, 3) gives [36667, 36667, 36666].
 */
export function splitAmount(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;

  return Array.from(
    { length: parts },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/**
 * Add months to a 'YYYY-MM-DD' date, clamping to the last day of the target month.
 * addMonthsNoOverflow('2027-01-31', 1) gives '2027-02-28', not March 3rd.
 */
export function addMonthsNoOverflow(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTarget));

  return target.toISOString().slice(0, 10);
}

/** Today's date in the server's local time zone, as 'YYYY-MM-DD'. */
export function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
