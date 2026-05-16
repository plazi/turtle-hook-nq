import { nqConfig } from "../config/config.ts";
import { walk, relative, TextLineStream } from "./deps.ts";

const graphUri = (fileName: string, graphUriPrefix: string) =>
  `<${graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.nt$/, "")
  }>`;

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
 * Handles the /nquads endpoint - returns all data as n-quads

 * by concatenating n-triples files and adding graph names
 */
export function handleNQuadsEndpoint(
  _request: Request, 
  ntriplesDir: string = nqConfig.ntriplesDir,
  graphUriPrefix: string = nqConfig.graphUriPrefix
): Response {

  async function* generate() {
    console.log(`[nquads] Starting to walk directory: ${ntriplesDir}`);
    let fileCount = 0;
    
    // Memory-efficient deduplication using 64-bit integer hashes (FNV-1a)
    // Avoids storing full string triples in memory (drastically reduces RAM usage)
    const seenTriples = new Set<bigint>();

    // Batch lines to reduce per-line allocations and GC pressure
    const encoder = new TextEncoder();

    const FLUSH_LINE_COUNT = 2048; // flush every ~2k lines (tunable)
    const FLUSH_CHAR_THRESHOLD = 1 << 20; // ~1MB of characters (approximate)
    let batch: string[] = [];
    let batchCharCount = 0;
    
    function flushBatchSync(): Uint8Array | null {
      if (batch.length === 0) return null;
      const chunk = batch.join("");
      batch = [];
      batchCharCount = 0;
      // Encode once per batch to minimize Uint8Array allocations
      return encoder.encode(chunk);
    }

    for await (const entry of walk(ntriplesDir, { 
      exts: [".nt"],
      includeDirs: false,
    })) {
      fileCount++;
      const relativePath = relative(ntriplesDir, entry.path);
      const graph = graphUri(relativePath, graphUriPrefix);

      const file = await Deno.open(entry.path, { read: true });
      try {
        const lineStream = file.readable
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream());

        for await (const line of lineStream) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Deduplication check using memory-efficient 64-bit hash
          const hash = fnv1a64(trimmed);
          if (seenTriples.has(hash)) continue;
          seenTriples.add(hash);
          
          // Append graph per triple. Defer encoding until batch flush.
          const nquad = trimmed.replace(/\.$/, ` ${graph} .`) + "\n";
          batch.push(nquad);
          batchCharCount += nquad.length;
          if (batch.length >= FLUSH_LINE_COUNT || batchCharCount >= FLUSH_CHAR_THRESHOLD) {
            // Flush batch to the consumer respecting backpressure
            const chunk = flushBatchSync();
            if (chunk) {
              yield chunk;
            }
          }
        }
      } finally {
        try { file.close(); } catch (_e) { /* file may already be closed by the pipeline */ }
      }
    }

    // Final flush (if any)
    if (batch.length) {
      const chunk = flushBatchSync();
      if (chunk) yield chunk;
    }

    console.log(`[nquads] Processed ${fileCount} files`);
  }

  // Consumer-driven stream prevents unbounded queuing
  const stream = ReadableStream.from(generate());

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
  ntriplesDir: string = nqConfig.ntriplesDir
): Response {

  async function* generate() {
    console.log(`[ntriples] Starting to walk directory: ${ntriplesDir}`);
    let fileCount = 0;
    
    // Memory-efficient deduplication using 64-bit integer hashes
    const seenTriples = new Set<bigint>();
    
    // Batching to minimize GC pressure
    const encoder = new TextEncoder();
    const FLUSH_LINE_COUNT = 2048; 
    const FLUSH_CHAR_THRESHOLD = 1 << 20; 
    let batch: string[] = [];
    let batchCharCount = 0;

    function flushBatchSync(): Uint8Array | null {
      if (batch.length === 0) return null;
      const chunk = batch.join("");
      batch = [];
      batchCharCount = 0;
      return encoder.encode(chunk);
    }

    for await (const entry of walk(ntriplesDir, { 
      exts: [".nt"],
      includeDirs: false,
    })) {
      fileCount++;
      const file = await Deno.open(entry.path, { read: true });
      try {
        const lineStream = file.readable
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new TextLineStream());

        for await (const line of lineStream) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          // Deduplication Check via low-memory 64-bit hash
          const hash = fnv1a64(trimmed);
          if (seenTriples.has(hash)) continue;
          seenTriples.add(hash);

          const ntriple = trimmed + "\n";
          batch.push(ntriple);
          batchCharCount += ntriple.length;
          
          if (batch.length >= FLUSH_LINE_COUNT || batchCharCount >= FLUSH_CHAR_THRESHOLD) {
            const chunk = flushBatchSync();
            if (chunk) yield chunk;
          }
        }
      } finally {
        try { file.close(); } catch (_e) { /* closed by pipeline */ }
      }
    }

    // Final flush
    if (batch.length) {
      const chunk = flushBatchSync();
      if (chunk) yield chunk;
    }

    // Optional: Log deduplication results
    console.log(`[ntriples] Processed ${fileCount} files. Streamed ${seenTriples.size} unique triples.`);
    
    // Free up set memory aggressively once complete
    seenTriples.clear();
  }

  const stream = ReadableStream.from(generate());

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/n-triples",
      "Content-Disposition": "attachment; filename=data.nt",
      "X-Stream-Mode": "generator-batched",
    },
  });
}
