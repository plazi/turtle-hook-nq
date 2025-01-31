import { readLines } from "https://jsr.io/@std/io";

// Set input and output file paths
const inputFile = "large.nq"; // Change to your actual file path
const outputFile = "filtered.nq";

export default async function removeQuads(
  inputFile: string,
  outputFile: string,
  ...exclude: string[]
) {
  // List of graph names to exclude
  const excludedGraphs = new Set(exclude);

  // Open files for reading and writing
  const inputFileHandle = await Deno.open(inputFile, { read: true });
  const outputFileHandle = await Deno.create(outputFile);
  const writer = outputFileHandle.writable.getWriter();

  // Process file line by line
  for await (const line of readLines(inputFileHandle)) {
    const parts = line.trim().split(" ");
    if (parts.length < 4) continue; // Ignore malformed lines

    const graphName = parts.length === 4 ? null : parts[3]; // Graph name is the fourth element if present

    if (!graphName || !excludedGraphs.has(graphName)) {
      await writer.write(new TextEncoder().encode(line + "\n"));
    }
  }

  // Clean up resources
  writer.close();
  inputFileHandle.close();
  outputFileHandle.close();

  console.log("Filtered file created successfully.");
}
