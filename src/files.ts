/** File-list handling for a job, kept free of I/O so it can be unit-tested. */

export interface FileChanges {
  added: string[];
  modified: string[];
  removed: string[];
}

/**
 * Reduces a job's changes to the turtle files to convert and to delete.
 *
 * A modified file is handled as removed and added again. The lists are
 * concatenated rather than spread into `push(...)`: spreading passes every
 * element as a function argument, which exceeds the engine's argument limit
 * ("Maximum call stack size exceeded") once a commit touches a few hundred
 * thousand files.
 */
export function ttlWork(
  { added, modified, removed }: FileChanges,
): { toAdd: string[]; toRemove: string[] } {
  const ttl = (files: string[]) => files.filter((f) => f.endsWith(".ttl"));
  const mod = ttl(modified);
  return {
    toAdd: ttl(added).concat(mod),
    toRemove: ttl(removed).concat(mod),
  };
}

/**
 * Like `Promise.all(items.map(fn))`, but with at most `limit` calls of `fn`
 * running at once, so a large commit does not spawn one process per file
 * simultaneously. Results keep the order of `items`.
 */
export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runner = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runner),
  );
  return results;
}
