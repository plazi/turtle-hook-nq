import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";
import { handleNQuads, handleNTriples } from "./endpoints.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});

// Port configuration
const mainPort = parseInt(Deno.env.get("PORT") || "4505");
const webhookPort = mainPort + 1;

console.log(`Starting Turtle-Hook-NQ server on port ${mainPort}...`);
console.log(`Data endpoints:`);
console.log(`  - /nquads - Get all data as N-Quads`);
console.log(`  - /ntriples - Get all data as N-Triples`);
console.log(`Webhook server on port ${webhookPort}`);

// Start GHActServer on a different port for webhook handling
const ghActServer = new GHActServer(worker, ghActConfig);

// Override environment to use webhook port
const originalPort = Deno.env.get("PORT");
Deno.env.set("PORT", webhookPort.toString());

// Start GHActServer in the background
ghActServer.serve().then(() => {
  console.log(`Webhook server ready on port ${webhookPort}`);
}).catch(error => {
  console.error("GHActServer error:", error);
});

// Restore original PORT
if (originalPort) {
  Deno.env.set("PORT", originalPort);
} else {
  Deno.env.delete("PORT");
}

// Small delay to ensure webhook server starts
await new Promise(resolve => setTimeout(resolve, 1000));

// Create our own HTTP server for data endpoints and webhook forwarding
await Deno.serve({ port: mainPort }, async (request: Request) => {
  const url = new URL(request.url);
  
  // Handle data endpoints
  if (url.pathname === "/nquads") {
    return await handleNQuads();
  }
  
  if (url.pathname === "/ntriples") {
    return await handleNTriples();
  }
  
  // Forward all other requests to GHActServer (webhooks, jobs, etc.)
  try {
    const webhookUrl = new URL(url.pathname + url.search, `http://localhost:${webhookPort}`);
    const response = await fetch(webhookUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    
    // Return the response from GHActServer
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error("Error forwarding request:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`Error: ${message}`, {
      status: 502,
    });
  }
}).finished;
