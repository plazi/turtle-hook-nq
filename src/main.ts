import { serveDir, Server, Status, STATUS_TEXT } from "./deps.ts";
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

const emptyDatadir = async () => {
  await Deno.remove("workdir/repo", { recursive: true });
};

const cloneRepo = async () => {
  console.warn("cloning repo (this WILL take some time)");
  const p = Deno.run({
    cmd: [
      "git",
      "clone",
      "--depth",
      "1",
      "https://github.com/plazi/treatments-rdf.git",
      "repo",
    ],
    cwd: "workdir",
  });
  const status = await p.status();
  if (!status.success) {
    throw new Error("Bad, really bad");
  }
};

const updateLocalData = async () => {
  await Deno.mkdir("workdir/repo/.git", { recursive: true });
  const p = Deno.run({
    cmd: ["git", "pull"],
    env: {
      GIT_CEILING_DIRECTORIES: Deno.cwd(),
    },
    cwd: "workdir/repo",
  });
  const status = await p.status();
  if (!status.success) {
    await emptyDatadir();
    await cloneRepo();
  }
};

const fileUri = (fileName: string) =>
  `<http://${Deno.env.get("HOSTNAME")}:4505/repo/${fileName}>`;

const graphUri = (fileName: string) =>
  `<${config.graphUriPrefix}/${fileName.replace(/\.ttl$/, "")}>`;

const DROP = (fileName: string) => `DROP GRAPH ${graphUri(fileName)}`;

/* SPARQL A LA (note the .ttl and domains) `
LOAD <https://plazi.github.io/treatments-rdf/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91.ttl> INTO GRAPH <https://raw.githubusercontent.com/plazi/treatments-rdf/main/data/A8/2F/87/A82F87957F0CFFFFFF3E5EE3FB54FE91>
` */
const LOAD = (fileName: string) =>
  `LOAD ${fileUri(fileName)} INTO GRAPH ${graphUri(fileName)}`;

const UPDATE = (fileName: string) => `${DROP(fileName)}; ${LOAD(fileName)}`;

const webhookHandler = async (request: Request) => {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST") {
    try {
      const json: webhookPayload = await request.json();
      const repoName = json.repository.full_name;

      console.log("· got webhook from", repoName);
      if (repoName !== config.repository) {
        throw new Error("Wrong Repository");
      }
      await updateLocalData();
      const added = json.commits.flatMap((c) => c.added);
      const removed = json.commits.flatMap((c) => c.removed);
      const modified = json.commits.flatMap((c) => c.modified);

      console.info("> got added   ", added); // -> LOAD
      console.info("> got removed ", removed); // -> DROP graphname
      console.info("> got modified", modified); // DROP; LOAD

      const statements = [
        ...added.map((f) => ({ statement: LOAD(f), fileName: f })),
        ...removed.map((f) => ({ statement: DROP(f), fileName: f })),
        ...modified.map((f) => ({ statement: UPDATE(f), fileName: f })),
      ];

      const failingFiles: string[] = [];
      let succeededOnce = false;

      for (const { statement, fileName } of statements) {
        try {
          console.debug("» handling", fileName);
          console.debug(statement);
          const response = await fetch(config.uploadUri, {
            method: "POST",
            body: statement,
            headers: { "Content-Type": "application/sparql-update" },
          });
          if (response.ok) {
            succeededOnce = true;
            console.debug("» success");
          } else {
            throw new Error(
              `Got ${response.status}:\n` + await response.text(),
            );
          }
        } catch (error) {
          failingFiles.push(fileName);
          console.group("» error:");
          console.warn(error);
          console.groupEnd();
        }
      }

      if (!succeededOnce) {
        throw new Error(`All failed:\n ${failingFiles.join("\n ")}`);
      } else if (failingFiles.length > 0) {
        return new Response(`Some failed:\n ${failingFiles.join("\n ")}`, {
          status: 200,
        });
      } else {
        return new Response(undefined, { status: 204 });
      }
    } catch (error) {
      return new Response(error, {
        status: Status.InternalServerError,
        statusText: STATUS_TEXT.get(Status.InternalServerError),
      });
    }
  } else if (pathname.startsWith("/repo")) {
    return serveDir(request, {
      fsRoot: "workdir/repo",
      urlRoot: "repo",
    });
  } else {
    return new Response(STATUS_TEXT.get(Status.MethodNotAllowed), {
      status: Status.MethodNotAllowed,
      statusText: STATUS_TEXT.get(Status.MethodNotAllowed),
    });
  }
};

console.log("updating local data...");
await updateLocalData();

const server = new Server({ handler: webhookHandler });
const listener = Deno.listen({ port: 4505 });
console.log("server listening on http://localhost:4505");

await server.serve(listener);
