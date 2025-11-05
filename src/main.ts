import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";
import { handleNQuadsEndpoint, handleNTriplesEndpoint } from "./endpoints.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});

// Create server with ghact 1.4.0 API
const server = new GHActServer(worker, ghActConfig);

// Register custom handlers for our endpoints
server.addHandler("/nquads", "GET", (request: Request) => {
  console.log("Handling /nquads request");
  return handleNQuadsEndpoint(request);
});

server.addHandler("/ntriples", "GET", (request: Request) => {
  console.log("Handling /ntriples request");
  return handleNTriplesEndpoint(request);
});

console.log(`Starting Turtle-Hook-nq server...`);
console.log(`Endpoints:`);
console.log(`  - /nquads - Get all data as N-Quads`);
console.log(`  - /ntriples - Get all data as N-Triples`);
console.log(`  - Other paths handled by GHAct`);

// Allow overriding the default port via the PORT environment variable (used by tests)
const port = Number(Deno.env.get("PORT") ?? 4505);
const listener = Deno.listen({ port, hostname: "0.0.0.0" });
await server.serve(listener);
