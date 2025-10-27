export default async function removeQuads(nqFile: string, ...exclude: string[]) {
  const outputFile = `${nqFile}-temp`;
  const excludedGraphs = new Set(exclude);

  const inputFile = await Deno.open(nqFile, { read: true });
  const outputFileHandle = await Deno.create(outputFile);
  const writer = outputFileHandle.writable.getWriter();

  try {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const buffer = new Uint8Array(65536); // 64KB buffer
    let leftover = "";
    let writeBuffer: string[] = [];
    const BATCH_SIZE = 1000; // Write every 1000 lines

    while (true) {
      const bytesRead = await inputFile.read(buffer);
      if (bytesRead === null) break;
      
      const decoded = decoder.decode(buffer.subarray(0, bytesRead), { stream: true });
      const lines = (leftover + decoded).split("\n");
      leftover = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue; // Skip empty lines
        
        const parts = line.trim().split(" ");
        if (parts.length < 4) continue;

        // In N-Quads: 4 parts = triple (no graph), 5+ parts = quad (with graph at parts[3])
        const graphName = parts.length === 4 ? null : parts[3];
        
        if (graphName === null || !excludedGraphs.has(graphName)) {
          writeBuffer.push(line);
          
          if (writeBuffer.length >= BATCH_SIZE) {
            await writer.write(encoder.encode(writeBuffer.join("\n") + "\n"));
            writeBuffer = [];
          }
        }
      }
    }

    // Write remaining lines
    if (writeBuffer.length > 0) {
      await writer.write(encoder.encode(writeBuffer.join("\n") + "\n"));
    }

    await writer.close();
    await inputFile.close();

    await Deno.remove(nqFile);
    await Deno.rename(outputFile, nqFile);
    console.log("Successfully removed graphs from file.");
  } catch (error) {
    console.error("Error processing file:", error);
    try {
      await Deno.remove(outputFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
