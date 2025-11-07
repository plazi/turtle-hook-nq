import { nqConfig } from "../config/config.ts";
import { walk, relative, TextLineStream } from "./deps.ts";

const graphUri = (fileName: string, graphUriPrefix: string) =>
  `<${graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.nt$/, "")
  }>`;

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

    for await (const entry of walk(ntriplesDir, { 
      exts: [".nt"],
      includeDirs: false,
    })) {
      fileCount++;
      const file = await Deno.open(entry.path, { read: true });
      try {
        const reader = file.readable.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) yield value; // backpressure respected by ReadableStream.from
        }
        reader.releaseLock();
      } finally {
        try { file.close(); } catch (_e) { /* file may already be closed by the pipeline */ }
      }
    }

    console.log(`[ntriples] Processed ${fileCount} files`);
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
