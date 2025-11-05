import { nqConfig } from "../config/config.ts";
import { walk, relative } from "./deps.ts";

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
          
          // Read the file and add graph names
          const content = await Deno.readTextFile(entry.path);
          const lines = content.split("\n");
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && trimmed.length > 0) {
              // Replace the final period with graph + period
              const nquad = trimmed.replace(/\.$/, ` ${graph} .`);
              controller.enqueue(encoder.encode(nquad + "\n"));
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
  const encoder = new TextEncoder();
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
          // Read and stream the file content as-is
          const content = await Deno.readTextFile(entry.path);
          controller.enqueue(encoder.encode(content));
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
