import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";
import { handleNQuadsEndpoint, handleNTriplesEndpoint } from "./endpoints.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});

// Custom handler that wraps GHAct functionality with our endpoints
const customHandler = async (request: Request, ghactHandler: (req: Request) => Promise<Response>): Promise<Response> => {
  const url = new URL(request.url);
  
  // Handle our custom endpoints first
  if (url.pathname === "/nquads") {
    console.log("Handling /nquads request");
    return await handleNQuadsEndpoint(request);
  } else if (url.pathname === "/ntriples") {
    console.log("Handling /ntriples request");
    return await handleNTriplesEndpoint(request);
  }
  
  // Delegate to GHAct handler for all other paths
  return await ghactHandler(request);
};

// Create server with custom handler using ghact 1.4.0 API
const server = new GHActServer(worker, ghActConfig, customHandler);

console.log(`Starting Turtle-Hook-nq server...`);
console.log(`Endpoints:`);
console.log(`  - /nquads - Get all data as N-Quads`);
console.log(`  - /ntriples - Get all data as N-Triples`);
console.log(`  - Other paths handled by GHAct`);

await server.serve(); // defaults to port 4505
