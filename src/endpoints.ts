import { nqConfig } from "../config/config.ts";
import { createHash, join, relative, TextLineStream, walk } from "./deps.ts";

const graphUri = (fileName: string, graphUriPrefix: string) =>
  `<${graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.nt$/, "")
  }>`;

/**
 * Tunables for the streaming behaviour of the export endpoints.
 */
export interface StreamOptions {
  /** Flush the pending batch once it holds this many lines. */
  flushLineCount?: number;
  /** Flush the pending batch once it holds roughly this many characters. */
  flushCharThreshold?: number;
  /**
   * Flush the pending batch (even if small) when the last chunk was sent
   * longer than this many milliseconds ago, so callers keep seeing progress.
   */
  maxFlushIntervalMs?: number;
  /**
   * When nothing at all could be sent for this many milliseconds (e.g. a long
   * run of files whose triples were all duplicates), emit a comment line as a
   * heartbeat so callers can tell "still working" from "hung".
   */
  heartbeatIntervalMs?: number;
  /**
   * GHAct job directory; the `till` commit of the newest completed job is
   * reported in the final `# END` line.
   */
  jobsDir?: string;
}

const DEFAULT_STREAM_OPTIONS: Required<StreamOptions> = {
  flushLineCount: 2048, // flush every ~2k lines (tunable)
  flushCharThreshold: 1 << 20, // ~1MB of characters (approximate)
  maxFlushIntervalMs: 2_000,
  heartbeatIntervalMs: 10_000,
  jobsDir: nqConfig.jobsDir,
};

/**
 * Returns the `till` commit of the newest completed job in `jobsDir`, i.e. the
 * repository state the n-triples files reflect at least. Job directories are
 * named by their ISO start time, so they sort chronologically.
 */
export async function latestCompletedTill(
  jobsDir: string,
): Promise<string | undefined> {
  const names: string[] = [];
  try {
    for await (const entry of Deno.readDir(jobsDir)) {
      if (entry.isDirectory) names.push(entry.name);
    }
  } catch (_e) {
    return undefined; // no jobs (yet)
  }
  names.sort().reverse();
  for (const name of names) {
    try {
      const status = JSON.parse(
        await Deno.readTextFile(join(jobsDir, name, "status.json")),
      );
      if (status.status === "completed" && status.job?.till) {
        return status.job.till;
      }
    } catch (_e) { /* job without a readable status */ }
  }
  return undefined;
}

type Paced<T> = { type: "value"; value: T } | { type: "tick" };

/**
 * Yields the values of `source`, plus a `tick` whenever the source has not
 * produced a value for `intervalMs`. The ticks come from a timer, so they also
 * arrive while the source is blocked on a single slow operation (opening a
 * file, waiting for the next line of a slow read, walking a huge directory) -
 * something a checkpoint inside the source's own loop cannot guarantee.
 */
async function* withTicks<T>(
  source: AsyncIterable<T>,
  intervalMs: number,
): AsyncGenerator<Paced<T>> {
  const iterator = source[Symbol.asyncIterator]();
  const TICK = Symbol("tick");
  let pending: Promise<IteratorResult<T>> | null = null;
  try {
    while (true) {
      pending ??= iterator.next();
      let timer: number | undefined;
      const timeout = new Promise<typeof TICK>((resolve) => {
        timer = setTimeout(() => resolve(TICK), intervalMs);
      });
      let result: IteratorResult<T> | typeof TICK;
      try {
        result = await Promise.race([pending, timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (result === TICK) {
        yield { type: "tick" };
        continue;
      }
      // The race is over, the next loop needs a fresh `iterator.next()`.
      pending = null;
      if (result.done) return;
      yield { type: "value", value: result.value };
    }
  } finally {
    // The consumer left (or threw) while a read was still in flight: keep the
    // abandoned promise from surfacing as an unhandled rejection and let the
    // source run its own cleanup (closing the current file).
    pending?.catch(() => {});
    await iterator.return?.();
  }
}

/**
 * Walks `ntriplesDir`, reads every `.nt` file and yields the (deduplicated)
 * triples as encoded chunks. With `graphUriPrefix` set every triple gets the
 * graph derived from its file name appended, i.e. the output is N-Quads,
 * otherwise it is N-Triples.
 *
 * The very first chunk is a comment line and is yielded before the directory
 * walk starts, so the client receives a first body byte immediately. Comment
 * lines (`# ...`) are part of the N-Triples/N-Quads grammar and are ignored
 * by RDF parsers.
 *
 * The very last line is `# END till=<commit> lines=<n> sha256=<hex>`, where
 * `n` is the number of lines before it and the hash covers all bytes before
 * it. Only a complete export has this line, so a consumer can reject a
 * truncated download: the last line must be the sentinel and
 * `head -n -1 | wc -l` and `head -n -1 | sha256sum` must match it.
 *
 * Duplicate triples are only removed within a file. Across files they are
 * kept: in N-Quads they belong to different graphs, and a global set of seen
 * triples cannot scale (a JavaScript Set holds at most 2^24 entries, which cut
 * every export off after 16,777,216 triples).
 */
async function* streamNTriplesFiles(
  label: string,
  ntriplesDir: string,
  graphUriPrefix: string | undefined,
  options: StreamOptions,
): AsyncGenerator<Uint8Array> {
  const opts = { ...DEFAULT_STREAM_OPTIONS, ...options };
  const format = graphUriPrefix === undefined ? "N-Triples" : "N-Quads";
  const encoder = new TextEncoder();
  const startedAt = new Date();

  // Everything sent before the `# END` line goes into its line count and hash
  const sha256 = createHash("sha256");
  let lineCount = 0;
  function counted(chunk: Uint8Array): Uint8Array {
    sha256.update(chunk);
    for (let i = chunk.indexOf(10); i !== -1; i = chunk.indexOf(10, i + 1)) {
      lineCount++;
    }
    return chunk;
  }

  // First byte for the client, before any file system access.
  yield counted(encoder.encode(
    `# turtle-hook-nq ${format} export started ${startedAt.toISOString()}\n`,
  ));
  // Read before the walk: the files reflect at least this commit.
  const till = await latestCompletedTill(opts.jobsDir) ?? "unknown";
  console.log(`[${label}] Starting to walk directory: ${ntriplesDir} (till ${till})`);

  let fileCount = 0;
  let tripleCount = 0;

  // Batch lines to reduce per-line allocations and GC pressure
  let batch: string[] = [];
  let batchCharCount = 0;
  let lastChunkSentAt = Date.now();

  function flushBatchSync(): Uint8Array | null {
    if (batch.length === 0) return null;
    const chunk = batch.join("");
    batch = [];
    batchCharCount = 0;
    // Encode once per batch to minimize Uint8Array allocations
    return encoder.encode(chunk);
  }

  /**
   * Keeps the client informed even when batches fill slowly (small files,
   * slow disk, long runs of duplicate triples): returns the pending batch when
   * it has been waiting for too long, a heartbeat comment when there was
   * nothing at all to send for even longer, and null otherwise.
   */
  function progressChunk(): Uint8Array | null {
    const idleMs = Date.now() - lastChunkSentAt;
    if (batch.length > 0) {
      return idleMs >= opts.maxFlushIntervalMs ? flushBatchSync() : null;
    }
    if (idleMs < opts.heartbeatIntervalMs) return null;
    return encoder.encode(
      `# still working: ${fileCount} files read, ${tripleCount} triples so far\n`,
    );
  }

  /**
   * The actual work: everything it yields is data for the client. It never
   * looks at the clock - the timer in `withTicks` below does that.
   */
  async function* produceChunks(): AsyncGenerator<Uint8Array> {
    for await (const entry of walk(ntriplesDir, {
      exts: [".nt"],
      includeDirs: false,
    })) {
      fileCount++;
      const graph = graphUriPrefix === undefined
        ? undefined
        : graphUri(relative(ntriplesDir, entry.path), graphUriPrefix);

      const file = await Deno.open(entry.path, { read: true });
      try {
        const lineStream = file.readable
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream());

        // Duplicates within one file only, see above
        const seenInFile = new Set<string>();
        for await (const line of lineStream) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          if (seenInFile.has(trimmed)) continue;
          seenInFile.add(trimmed);
          tripleCount++;

          // Append graph per triple. Defer encoding until batch flush.
          const out = (graph === undefined
            ? trimmed
            : trimmed.replace(/\s*\.$/, ` ${graph} .`)) + "\n";
          batch.push(out);
          batchCharCount += out.length;
          if (
            batch.length >= opts.flushLineCount ||
            batchCharCount >= opts.flushCharThreshold
          ) {
            // Flush batch to the consumer respecting backpressure
            const chunk = flushBatchSync();
            if (chunk) yield chunk;
          }
        }
      } finally {
        try {
          file.close();
        } catch (_e) { /* file may already be closed by the pipeline */ }
      }

      // A file boundary is a cheap, deterministic place to look at the clock,
      // whatever the timer below happened to do.
      const chunk = progressChunk();
      if (chunk) yield chunk;
    }

    // Final flush (if any)
    const chunk = flushBatchSync();
    if (chunk) yield chunk;

    const message =
      `${fileCount} files, ${tripleCount} triples, took ${
        ((Date.now() - startedAt.getTime()) / 1000).toFixed(1)
      }s`;
    console.log(`[${label}] Completed export: ${message}`);
    yield encoder.encode(`# export complete: ${message}\n`);
  }

  // Look at the clock at least as often as the shortest promise we make, so a
  // stall anywhere in produceChunks() is noticed within one interval.
  const tickMs = Math.max(
    1,
    Math.min(opts.maxFlushIntervalMs, opts.heartbeatIntervalMs),
  );

  try {
    for await (const event of withTicks(produceChunks(), tickMs)) {
      const chunk = event.type === "tick" ? progressChunk() : event.value;
      if (!chunk) continue;
      yield counted(chunk);
      // Set after the yield returns: while the consumer is slow to read, it is
      // the consumer that is busy, not us, and it needs no heartbeat.
      lastChunkSentAt = Date.now();
    }
  } catch (e) {
    // The response is already under way (status 200), so the client can only
    // notice the missing `# END` line; make sure the server log tells why.
    console.error(`[${label}] Export aborted: ${e}`);
    throw e;
  }

  yield encoder.encode(
    `# END till=${till} lines=${lineCount} sha256=${sha256.digest("hex")}\n`,
  );
}

/**
 * Handles the /nquads endpoint - returns all data as n-quads
 * by concatenating n-triples files and adding graph names
 */
export function handleNQuadsEndpoint(
  _request: Request,
  ntriplesDir: string = nqConfig.ntriplesDir,
  graphUriPrefix: string = nqConfig.graphUriPrefix,
  options: StreamOptions = {},
): Response {
  // Consumer-driven stream prevents unbounded queuing
  const stream = ReadableStream.from(
    streamNTriplesFiles("nquads", ntriplesDir, graphUriPrefix, options),
  );

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/n-quads",
      "Content-Disposition": "attachment; filename=data.nq",
      "X-Stream-Mode": "generator-batched",
    },
  });
}

/**
 * Handles the /ntriples endpoint - returns all data as n-triples
 * by concatenating n-triples files without graph names
 */
export function handleNTriplesEndpoint(
  _request: Request,
  ntriplesDir: string = nqConfig.ntriplesDir,
  options: StreamOptions = {},
): Response {
  const stream = ReadableStream.from(
    streamNTriplesFiles("ntriples", ntriplesDir, undefined, options),
  );

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/n-triples",
      "Content-Disposition": "attachment; filename=data.nt",
      "X-Stream-Mode": "generator-batched",
    },
  });
}
