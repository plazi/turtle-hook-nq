import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";

// TODO ensure that turtle served from /workdir/repository still has the correct Content-Type set
// if (pathname.startsWith("/repo")) {
//   console.log("· Got file request for", pathname);
//   const response = await serveDir(request, {
//     fsRoot: "workdir/repo",
//     urlRoot: "repo",
//   });
//   response.headers.set("Content-Type", "text/turtle");
//   return response;

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});
const server = new GHActServer(worker, ghActConfig);
await server.serve(); // defaults to port 4505
