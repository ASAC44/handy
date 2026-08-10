# Sidebar — Bun monorepo. The server serves the web bundle + /ws + the API routes on
# a single port (:3001), so one Tailscale `serve` carries everything.
#
# This image is used by docker-compose.yml in HOT-RELOAD mode: your working tree is
# bind-mounted over /app and the server runs under `bun --watch`, so server-side edits
# reload live. The web bundle is (re)built when the container starts. The deps installed
# below are preserved inside the container via anonymous volumes (see compose), so the
# host's Windows-built node_modules never shadow the Linux ones.
FROM oven/bun:1

WORKDIR /app

# Install deps first, keyed only on the manifests, so this layer caches across source
# edits. Every workspace package.json must be present for `bun install` to resolve the
# workspace graph (root + apps/* + packages/*).
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# Fallback copy so the image is runnable even without the compose bind-mount. At runtime
# the bind-mount shadows this with your working tree.
COPY . .

EXPOSE 3001

# Build the web bundle into apps/web/dist, then serve + watch the server. Overridden by
# the compose `command`, but kept so `docker run` on this image alone also works.
CMD ["sh", "-c", "bun run build && bun --watch apps/server/src/index.ts"]
