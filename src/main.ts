import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";
import { handleNQuadsEndpoint, handleNTriplesEndpoint } from "./endpoints.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});

// Monkey-patch the GHActServer to add our custom endpoints
// We'll intercept the fetch handler
const ghactServer = new GHActServer(worker, ghActConfig);

// Save the original serve method
const originalServe = ghactServer.serve.bind(ghactServer);

// Override serve to wrap the handler with our custom logic
ghactServer.serve = async function(options) {
  const port = options?.port || 4505;
  
  console.log(`Starting Turtle-Hook-nq server on port ${port}...`);
  console.log(`Endpoints:`);
  console.log(`  - /nquads - Get all data as N-Quads`);
  console.log(`  - /ntriples - Get all data as N-Triples`);
  console.log(`  - Other paths handled by GHAct`);
  
  // We need to use the internal handler if available
  // Try to access it through the server's private properties
  const internalHandler = (ghactServer as any).handler || 
                         (ghactServer as any).fetch ||
                         (ghactServer as any).handleRequest;
  
  const customHandler = async (request: Request, info?: any): Promise<Response> => {
    const url = new URL(request.url);
    
    // Handle our custom endpoints first
    if (url.pathname === "/nquads") {
      console.log("Handling /nquads request");
      return await handleNQuadsEndpoint(request);
    } else if (url.pathname === "/ntriples") {
      console.log("Handling /ntriples request");
      return await handleNTriplesEndpoint(request);
    }
    
    // Try to delegate to the original GHAct handler if it exists
    if (internalHandler) {
      return await internalHandler.call(ghactServer, request, info);
    }
    
    // Fallback: basic response
    return new Response(
      JSON.stringify({
        message: "Turtle-Hook-nq Server",
        endpoints: {
          nquads: "/nquads",
          ntriples: "/ntriples"
        }
      }, null, 2),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  };
  
  return Deno.serve({ port, ...options }, customHandler);
};

await ghactServer.serve();
