import { Server, Status, STATUS_TEXT } from "./deps.ts";
import { config } from "../config/config.ts";

const webhookHandler = async (request: Request) => {
  if (request.method === "POST") {
    try {
      const json = await request.json();
      const repoName = json.repository?.full_name;
      // deno-lint-ignore no-explicit-any
      const commits = (json.commits as any[]).map((
        { id, added, removed, modified },
      ) => ({ id, added, removed, modified }));
      console.log("· got webhook from", repoName);
      console.log("> got added   ", commits.flatMap((c) => c.added));
      console.log("> got removed ", commits.flatMap((c) => c.removed));
      console.log("> got modified", commits.flatMap((c) => c.modified));

      /* SPARQL A LA (note the .ttl and domains) `
      LOAD <https://plazi.github.io/treatments-rdf/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91.ttl> INTO GRAPH <https://raw.githubusercontent.com/plazi/treatments-rdf/main/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91>
      ` */

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
