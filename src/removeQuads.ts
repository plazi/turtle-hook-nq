import { readLines } from "jsr:@std/io@0.224.0";

export default async function removeQuads(nqFile: string, ...exclude: string[]) {
  const outputFile = `${nqFile}-temp`;
  const excludedGraphs = new Set(exclude);

  // Open files
  const inputFileHandle = await Deno.open(nqFile, { read: true });
  const outputFileHandle = await Deno.create(outputFile);
  const writer = outputFileHandle.writable.getWriter();

  try {
    // Process file line by line
    for await (const line of readLines(inputFileHandle)) {
      const parts = line.trim().split(" ");
      if (parts.length < 4) continue; // Ignore malformed lines

      const graphName = parts.length === 4 ? null : parts[3]; // Graph name is the fourth element if present

      if (!graphName || !excludedGraphs.has(graphName)) {
        await writer.write(new TextEncoder().encode(line + "\n"));
      }
    }

    // Close the writer explicitly (this should also close outputFileHandle)
    await writer.close();
    inputFileHandle.close();

    // Replace the original file
    await Deno.remove(nqFile);
    await Deno.rename(outputFile, nqFile);
    console.log("Successfully removed graphs from file.");
  } catch (error) {
    console.error("Error processing file:", error);
  } finally {
    // Ensure cleanup
    if (!writer.locked) writer.releaseLock();
    if (!inputFileHandle.rid) inputFileHandle.close();
  }
}
