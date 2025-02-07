export default async function removeQuads(nqFile: string, ...exclude: string[]) {
  const outputFile = `${nqFile}-temp`;
  const excludedGraphs = new Set(exclude);

  // Open files
  const inputFileHandle = await Deno.open(nqFile, { read: true });
  const outputFileHandle = await Deno.create(outputFile);
  const writer = outputFileHandle.writable.getWriter();

  try {
    // Create a buffered reader
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(1024);
    let leftover = "";

    while (true) {
      const bytesRead = await inputFileHandle.read(buffer);
      if (bytesRead === null) break;
      
      const decoded = decoder.decode(buffer.subarray(0, bytesRead));
      const lines = (leftover + decoded).split("\n");
      leftover = lines.pop() ?? "";

      for (const line of lines) {
        const parts = line.trim().split(" ");
        if (parts.length < 4) continue; // Ignore malformed lines

        const graphName = parts.length === 4 ? null : parts[3]; // Graph name is the fourth element if present

        if (!graphName || !excludedGraphs.has(graphName)) {
          await writer.write(new TextEncoder().encode(line + "\n"));
        }
      }
    }

    // Close the writer explicitly (this should also close outputFileHandle)
    await writer.close();
    await inputFileHandle.close();

    // Replace the original file
    await Deno.remove(nqFile);
    await Deno.rename(outputFile, nqFile);
    console.log("Successfully removed graphs from file.");
  } catch (error) {
    console.error("Error processing file:", error);
  } finally {
    // Ensure cleanup
    writer.releaseLock();
    inputFileHandle.close();
  }
}
