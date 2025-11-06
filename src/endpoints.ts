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
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log(`[nquads] Starting to walk directory: ${ntriplesDir}`);
        
        let fileCount = 0;
        // Walk through all .nt files in the ntriples directory
        for await (const entry of walk(ntriplesDir, { 
          exts: [".nt"],
          includeDirs: false,
        })) {
          fileCount++;
          const relativePath = relative(ntriplesDir, entry.path);
          const graph = graphUri(relativePath, graphUriPrefix);
          
          // Stream the file line-by-line and add graph names to each triple
          const file = await Deno.open(entry.path, { read: true });
          try {
            const lineStream = file.readable
              .pipeThrough(new TextDecoderStream())
              .pipeThrough(new TextLineStream());

            for await (const line of lineStream) {
              const trimmed = line.trim();
              if (trimmed) {
                // Replace the final period with graph + period
                const nquad = trimmed.replace(/\.$/, ` ${graph} .`);
                controller.enqueue(encoder.encode(nquad + "\n"));
              }
            }
          } finally {
            try {
              file.close();
            } catch (_e) {
              // Ignore if the file was already closed by the stream
            }
          }
        }
        
        console.log(`[nquads] Processed ${fileCount} files, closing stream`);
        controller.close();
      } catch (error) {
        console.error(`[nquads] Error in stream:`, error);
        try {
          controller.error(error);
        } catch (e) {
          console.error(`[nquads] Failed to signal error to controller:`, e);
        }
      }
    },
  });
  
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/n-quads",
      "Content-Disposition": "attachment; filename=data.nq",
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
  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log(`[ntriples] Starting to walk directory: ${ntriplesDir}`);
        
        let fileCount = 0;
        // Walk through all .nt files in the ntriples directory
        for await (const entry of walk(ntriplesDir, { 
          exts: [".nt"],
          includeDirs: false,
        })) {
          fileCount++;
          // Stream the file content as-is without loading entire file into memory
          const file = await Deno.open(entry.path, { read: true });
          try {
            const reader = file.readable.getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
            reader.releaseLock();
          } finally {
            try {
              file.close();
            } catch (_e) {
              // Ignore if already closed
            }
          }
        }
        
        controller.close();
      } catch (error) {
        console.error(`[ntriples] Error in stream:`, error);
        try {
          controller.error(error);
        } catch (e) {
          console.error(`[ntriples] Failed to signal error to controller:`, e);
        }
      }
    },
  });
  
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/n-triples",
      "Content-Disposition": "attachment; filename=data.nt",
    },
  });
}
