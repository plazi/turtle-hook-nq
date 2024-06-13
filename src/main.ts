import { GHActServer } from "./deps.ts";
import { ghActConfig } from "../config/config.ts";

const worker = new Worker(import.meta.resolve("./worker.ts"), {
  type: "module",
});
const server = new GHActServer(worker, ghActConfig);
await server.serve(); // defaults to port 4505
