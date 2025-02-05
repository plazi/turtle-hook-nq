import { readLines } from "jsr:@std/io@0.224.0";

export default async function removeQuads(nqFile: string, ...exclude: string[]) {
  const outputFile = Deno.makeTempFileSync({ prefix: "quads" });
  const excludedGraphs = new Set(exclude);

  let inputFileHandle, outputFileHandle, writer;

  try {
    // Open files for reading and writing
    inputFileHandle = await Deno.open(nqFile, { read: true });
    outputFileHandle = await Deno.create(outputFile);
    writer = outputFileHandle.writable.getWriter();

    // Process file line by line
    for await (const line of readLines(inputFileHandle)) {
      const parts = line.trim().split(" ");
      if (parts.length < 4) continue; // Ignore malformed lines

      const graphName = parts.length === 4 ? null : parts[3]; // Graph name is the fourth element if present

      if (!graphName || !excludedGraphs.has(graphName)) {
        await writer.write(new TextEncoder().encode(line + "\n"));
      }
    }
  } finally {
    // Clean up resources safely
    if (writer) await writer.close();
    if (inputFileHandle) inputFileHandle.close();
    // asume this is closed by eriter.close: if (outputFileHandle) outputFileHandle.close();
  }

  // Replace the original file with the filtered one
  await Deno.rename(outputFile, nqFile);
  console.log("Successfully removed graphs from file.");
}
