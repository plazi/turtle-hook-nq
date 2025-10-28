import { nqConfig } from "../config/config.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join, relative } from "https://deno.land/std@0.224.0/path/mod.ts";

const graphUri = (fileName: string) =>
  `<${nqConfig.graphUriPrefix}/${
    fileName.replace(/.*\//, "").replace(/\.nt$/, "")
  }>`;

/**
 * Handles the /nquads endpoint - returns all data as n-quads
 * by concatenating n-triples files and adding graph names
 */
export async function handleNQuadsEndpoint(request: Request): Promise<Response> {
  try {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Walk through all .nt files in the ntriples directory
          for await (const entry of walk(nqConfig.ntriplesDir, { 
            exts: [".nt"],
            includeDirs: false,
          })) {
            const relativePath = relative(nqConfig.ntriplesDir, entry.path);
            const graph = graphUri(relativePath);
            
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
          
          controller.close();
        } catch (error) {
          controller.error(error);
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
  } catch (error) {
    return new Response(`Error generating n-quads: ${error.message}`, {
      status: 500,
    });
  }
}

/**
 * Handles the /ntriples endpoint - returns all data as n-triples
 * by concatenating n-triples files without graph names
 */
export async function handleNTriplesEndpoint(request: Request): Promise<Response> {
  try {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Walk through all .nt files in the ntriples directory
          for await (const entry of walk(nqConfig.ntriplesDir, { 
            exts: [".nt"],
            includeDirs: false,
          })) {
            // Read and stream the file content as-is
            const content = await Deno.readTextFile(entry.path);
            controller.enqueue(encoder.encode(content));
          }
          
          controller.close();
        } catch (error) {
          controller.error(error);
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
  } catch (error) {
    return new Response(`Error generating n-triples: ${error.message}`, {
      status: 500,
    });
  }
}
