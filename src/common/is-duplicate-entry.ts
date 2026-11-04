import { QueryFailedError } from 'typeorm';

/**
 * True when MySQL rejected a write because of a UNIQUE index (error 1062).
 * Pass `indexName` to match only that index, e.g. to tell a duplicate
 * active loan apart from any other unique violation.
 */
export function isDuplicateEntry(error: unknown, indexName?: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const { code, sqlMessage } = error.driverError as {
    code?: string;
    sqlMessage?: string;
  };

  // MySQL's message looks like: Duplicate entry '7' for key 'loans.uq_loans_...'
  return (
    code === 'ER_DUP_ENTRY' &&
    (indexName === undefined || (sqlMessage ?? '').includes(indexName))
  );
}
