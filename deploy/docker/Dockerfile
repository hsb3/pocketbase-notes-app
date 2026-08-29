# Multi-arch image: builds natively for the host/target platform.
# Local dev on Apple Silicon -> linux/arm64; Railway -> linux/amd64.
# Build context is the repo root: docker build -f deploy/docker/Dockerfile .

FROM oven/bun:1.4.0-alpine@sha256:07235578f79ef8c6f97d94aee7938e76f5cdba5f21ae5dbfdd3d3d38058437eb AS frontend-build

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./

RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache bun install --frozen-lockfile

COPY . .

RUN bun run build


FROM alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce

# The PocketBase server and JS SDK are version-coupled: server 0.40.x pairs
# with the pocketbase npm package ^0.28 (see package.json). Bump them together.
ARG PB_VERSION=0.40.1
# Per-arch checksums from the official release checksums.txt asset.
ARG PB_SHA256_AMD64=0f3442d2e57b03b56fbff0d09289e4a30b4f561a44338c38d2dcd4a1a0cfa91e
ARG PB_SHA256_ARM64=8e15eb6080de5ae7fcf789ac963d5c3c9328a491d5f7a24eb13c93a2f4bae4f1

# Set automatically by BuildKit to the target platform's arch (amd64 | arm64).
ARG TARGETARCH

RUN apk add --no-cache \
  unzip \
  ca-certificates \
  openssl

RUN case "${TARGETARCH}" in \
    amd64) PB_SHA256="${PB_SHA256_AMD64}" ;; \
    arm64) PB_SHA256="${PB_SHA256_ARM64}" ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && wget -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
  && echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
  && unzip /tmp/pb.zip -d /pb/ \
  && rm /tmp/pb.zip

COPY ./pb/hooks /pb/pb_hooks

COPY ./pb/migrations /pb/pb_migrations

COPY --from=frontend-build /app/dist /pb/pb_public

EXPOSE 8080

# start PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--encryptionEnv=PB_ENCRYPTION_KEY"]
