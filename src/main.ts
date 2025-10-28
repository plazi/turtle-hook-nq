import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";
import { handleNQuads, handleNTriples } from "./endpoints.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});

// Port configuration
const port = parseInt(Deno.env.get("PORT") || "4505");

console.log(`Starting Turtle-Hook-NQ server on port ${port}...`);
console.log(`Data endpoints:`);
console.log(`  - /nquads - Get all data as N-Quads`);
console.log(`  - /ntriples - Get all data as N-Triples`);

// Start GHActServer on a different port for webhook handling
const ghActPort = port + 1;
const ghActServer = new GHActServer(worker, ghActConfig);

// Override the port for GHActServer
Deno.env.set("PORT", ghActPort.toString());
ghActServer.serve().then(() => {
  console.log(`GHActServer (webhooks) running on port ${ghActPort}`);
}).catch(error => {
  console.error("GHActServer error:", error);
});

// Create our own HTTP server for data endpoints
await Deno.serve({ port }, async (request: Request) => {
  const url = new URL(request.url);
  
  // Handle custom endpoints
  if (url.pathname === "/nquads") {
    return await handleNQuads();
  }
  
  if (url.pathname === "/ntriples") {
    return await handleNTriples();
  }
  
  // Health check endpoint
  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response(
      JSON.stringify({
        service: ghActConfig.title,
        description: ghActConfig.description,
        status: "running",
        endpoints: {
          nquads: "/nquads - Get all data as N-Quads",
          ntriples: "/ntriples - Get all data as N-Triples",
        },
        webhook_port: ghActPort,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  
  // Forward webhook requests to GHActServer
  if (url.pathname.startsWith("/webhook") || url.pathname.startsWith("/job")) {
    try {
      const ghActUrl = new URL(url.pathname + url.search, `http://localhost:${ghActPort}`);
      const response = await fetch(ghActUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return response;
    } catch (error) {
      return new Response(`Error forwarding to webhook handler: ${error}`, {
        status: 502,
      });
    }
  }
  
  return new Response("Not Found", { status: 404 });
}).finished;
