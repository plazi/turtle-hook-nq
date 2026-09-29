import { nqConfig } from "../config/config.ts";
import { walk, relative, TextLineStream } from "./deps.ts";

const graphUri = (fileName: string, graphUriPrefix: string) =>
  `<${graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.nt$/, "")
  }>`;

/**
 * Subjects gg2rdf wrote before plazi/gg2rdf#33 made `https://` canonical. A
 * file that still has them was not regenerated since, and its treatment does
 * not share the IRI of the graph it is placed in.
 */
const LEGACY_HTTP_SUBJECT =
  /^<http:\/\/(treatment|taxon-name|taxon-concept|publication|tb)\.plazi\.org\//;

const FNV_PRIME = 1099511628211n;
const FNV_OFFSET = 14695981039346656037n;

function fnv1a64(str: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash *= FNV_PRIME;
    hash = BigInt.asUintN(64, hash);
  }
  return hash;
}

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
}

const DEFAULT_STREAM_OPTIONS: Required<StreamOptions> = {
  flushLineCount: 2048, // flush every ~2k lines (tunable)
  flushCharThreshold: 1 << 20, // ~1MB of characters (approximate)
  maxFlushIntervalMs: 2_000,
  heartbeatIntervalMs: 10_000,
};

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
      const result = await Promise.race([pending, timeout]);
      clearTimeout(timer);
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
 * by RDF parsers. A final comment line reports the number of files and
 * triples, so a truncated download can be told apart from a complete one — and
 * how many files still carry `http://` Plazi subjects, which predate
 * plazi/gg2rdf#33 and no longer match the `https://` graph they land in.
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

  // First byte for the client, before any file system access.
  yield encoder.encode(
    `# turtle-hook-nq ${format} export started ${startedAt.toISOString()}\n`,
  );
  console.log(`[${label}] Starting to walk directory: ${ntriplesDir}`);

  let fileCount = 0;
  let legacyFileCount = 0;

  // Memory-efficient deduplication using 64-bit integer hashes (FNV-1a)
  // Avoids storing full string triples in memory (drastically reduces RAM usage)
  const seenTriples = new Set<bigint>();

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
      `# still working: ${fileCount} files read, ${seenTriples.size} unique triples so far\n`,
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
      let legacy = false;
      try {
        const lineStream = file.readable
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream());

        for await (const line of lineStream) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!legacy && LEGACY_HTTP_SUBJECT.test(trimmed)) legacy = true;

          // Deduplication check using memory-efficient 64-bit hash
          const hash = fnv1a64(trimmed);
          if (seenTriples.has(hash)) continue;
          seenTriples.add(hash);

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
      if (legacy) legacyFileCount++;

      // A file boundary is a cheap, deterministic place to look at the clock,
      // whatever the timer below happened to do.
      const chunk = progressChunk();
      if (chunk) yield chunk;
    }

    // Final flush (if any)
    const chunk = flushBatchSync();
    if (chunk) yield chunk;

    const legacyNote = legacyFileCount === 0
      ? ""
      : `, ${legacyFileCount} files still with http:// plazi subjects (pre-gg2rdf#33, regenerate)`;
    const message =
      `${fileCount} files, ${seenTriples.size} unique triples, took ${
        ((Date.now() - startedAt.getTime()) / 1000).toFixed(1)
      }s${legacyNote}`;
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
      yield chunk;
      // Set after the yield returns: while the consumer is slow to read, it is
      // the consumer that is busy, not us, and it needs no heartbeat.
      lastChunkSentAt = Date.now();
    }
  } finally {
    // Free up set memory aggressively once complete
    seenTriples.clear();
  }
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
