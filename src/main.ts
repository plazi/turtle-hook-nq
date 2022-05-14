import { Server, Status, STATUS_TEXT } from "./deps.ts";
import { config } from "../config/config.ts";

// Incomplete, only what we need
type webhookPayload = {
  repository: {
    full_name: string;
  };
  commits: {
    added: string[];
    removed: string[];
    modified: string[];
  }[];
};

const fileUri = (fileName: string) =>
  `<${config.repositoryWebUri}/${fileName}>`;

const graphUri = (fileName: string) =>
  `<${config.graphUriPrefix}/${fileName.replace(/\.ttl$/, "")}`;

/* SPARQL A LA (note the .ttl and domains) `
LOAD <https://plazi.github.io/treatments-rdf/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91.ttl> INTO GRAPH <https://raw.githubusercontent.com/plazi/treatments-rdf/main/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91>
` */
const loadQuery = (fileName: string) =>
  `DROP ${graphUri(fileName)};
  LOAD ${fileUri(fileName)} INTO GRAPH ${graphUri(fileName)}`;

const webhookHandler = async (request: Request) => {
  if (request.method === "POST") {
    try {
      const json: webhookPayload = await request.json();
      const repoName = json.repository.full_name;
      const added = json.commits.flatMap((c) => c.added);
      const removed = json.commits.flatMap((c) => c.removed);
      const modified = json.commits.flatMap((c) => c.modified);

      console.log("· got webhook from", repoName);
      if (repoName !== config.repository) {
        throw new Error("Wrong Repository");
      }

      console.log("> got added   ", added);
      console.log("> got removed ", removed);
      console.log("> got modified", modified);

      return new Response("yes", { status: 200 });
    } catch (error) {
      return new Response(error, {
        status: Status.InternalServerError,
        statusText: STATUS_TEXT.get(Status.InternalServerError),
      });
    }
  } else {
    return new Response(STATUS_TEXT.get(Status.MethodNotAllowed), {
      status: Status.MethodNotAllowed,
      statusText: STATUS_TEXT.get(Status.MethodNotAllowed),
    });
  }
};

const server = new Server({ handler: webhookHandler });
const listener = Deno.listen({ port: 4505 });

console.log("server listening on http://localhost:4505");

await server.serve(listener);
