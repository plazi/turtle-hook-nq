import { nqConfig } from "../config/config.ts";
import { existsSync } from "https://deno.land/x/ghact@1.2.6/src/deps.ts";
import { graphUri } from "./utils.ts";

/**
 * Get all .nt files recursively from the ntriples directory
 */
async function getAllNTFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  if (!existsSync(dir)) {
    return files;
  }
  
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      files.push(...await getAllNTFiles(fullPath));
    } else if (entry.name.endsWith(".nt")) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Convert a .nt file path to the original .ttl filename for graph name generation
 */
function ntPathToTtlFilename(ntPath: string): string {
  // Remove the ntriples directory prefix and change .nt to .ttl
  const relativePath = ntPath.replace(nqConfig.ntriplesDir + "/", "");
  return relativePath.replace(/\.nt$/, ".ttl");
}

/**
 * Endpoint handler for /nquads
 * Returns all data as n-quads by concatenating files and adding graph names
 */
export async function handleNQuads(): Promise<Response> {
  try {
    const ntFiles = await getAllNTFiles(nqConfig.ntriplesDir);
    
    if (ntFiles.length === 0) {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "application/n-quads",
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const ntFile of ntFiles) {
          try {
            const content = await Deno.readTextFile(ntFile);
            const lines = content.split("\n");
            const ttlFilename = ntPathToTtlFilename(ntFile);
            const graphName = graphUri(ttlFilename);
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine && !trimmedLine.startsWith("#")) {
                // Convert n-triple to n-quad by adding graph name
                // Remove the trailing period and add graph name + period
                const nquad = trimmedLine.replace(/\.$/, ` ${graphName} .`);
                controller.enqueue(encoder.encode(nquad + "\n"));
              }
            }
          } catch (error) {
            console.error(`Error reading file ${ntFile}:`, error);
            // Continue with other files
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/n-quads",
        "Content-Disposition": "attachment; filename=\"data.nq\"",
      },
    });
  } catch (error) {
    console.error("Error handling /nquads:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Error: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

/**
 * Endpoint handler for /ntriples
 * Returns all data as n-triples by concatenating files
 */
export async function handleNTriples(): Promise<Response> {
  try {
    const ntFiles = await getAllNTFiles(nqConfig.ntriplesDir);
    
    if (ntFiles.length === 0) {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "application/n-triples",
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const ntFile of ntFiles) {
          try {
            const content = await Deno.readTextFile(ntFile);
            const lines = content.split("\n");
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine && !trimmedLine.startsWith("#")) {
                controller.enqueue(encoder.encode(trimmedLine + "\n"));
              }
            }
          } catch (error) {
            console.error(`Error reading file ${ntFile}:`, error);
            // Continue with other files
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/n-triples",
        "Content-Disposition": "attachment; filename=\"data.nt\"",
      },
    });
  } catch (error) {
    console.error("Error handling /ntriples:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Error: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
