FROM denoland/deno:2.1.9

# Install cron
RUN DEBIAN_FRONTEND=noninteractive apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y procps psmisc git raptor2-utils

# The port that your application listens to.
EXPOSE 4505

WORKDIR /app

# Prefer not to run as root.
# USER deno

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY src/deps.ts src/deps.ts
RUN deno cache src/deps.ts

# These steps will be re-run upon each file change in your working directory:
ADD src src
ADD config config
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache src/main.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-run=git,rapper", "--allow-env", "src/main.ts"]