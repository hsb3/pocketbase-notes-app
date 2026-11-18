#!/bin/sh
# Runs inside the capped preparation container. The test network has no uplink.
set -eu
recipe=deploy/docker/Dockerfile
case "$(uname -m)" in
  aarch64) arch=arm64 ;;
  x86_64) arch=amd64 ;;
  *) echo "Unsupported PocketBase architecture: $(uname -m)" >&2; exit 1 ;;
esac
version=$(sed -n 's/^ARG PB_VERSION=//p' "$recipe")
checksum=$(sed -n "s/^ARG PB_SHA256_$(echo "$arch" | tr '[:lower:]' '[:upper:]')=//p" "$recipe")
wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_linux_${arch}.zip"
echo "$checksum  /tmp/pb.zip" | sha256sum -c -
unzip -q /tmp/pb.zip pocketbase -d /pb
chmod 755 /pb/pocketbase
/pb/pocketbase --version
cp -R pb/hooks /pb/pb_hooks
cp -R pb/migrations /pb/pb_migrations
bun install --frozen-lockfile
bun x vite build --logLevel warn --outDir /pb/pb_public
