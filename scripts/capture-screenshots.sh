#!/bin/sh
# Capture the README screenshots and recording from a running, freshly seeded stack.
#   make app STACK=shots STACK_PORT=8290 ...   then   scripts/capture-screenshots.sh shots out/
# Chromium runs in a limited Playwright container on the stack's network; ffmpeg
# (host) turns the recording into a GIF. Review every image before copying it into
# docs/images. Each run adds a "Garden plans" note, so use a fresh stack.
set -eu

stack=${1:?usage: scripts/capture-screenshots.sh <stack> <out-dir>}
out=${2:?usage: scripts/capture-screenshots.sh <stack> <out-dir>}
version=$(sed -n 's/.*"version": "\(.*\)".*/\1/p' node_modules/playwright-core/package.json)
mkdir -p "$out"
out=$(cd "$out" && pwd)

docker run --rm --init --cpus 2 --memory 4g --pids-limit 512 --stop-timeout 5 \
	--network "${stack}_default" \
	-v "$PWD:/work:ro" -v "$out:/out" -w /work \
	-e APP_URL=http://pocketbase:8080 -e OUT_DIR=/out \
	"mcr.microsoft.com/playwright:v${version}-noble" \
	timeout 600 node tests/screenshots/capture.cjs

# Two-pass palette GIF: 1024 px wide, 12 fps.
ffmpeg -loglevel error -y -i "$out/core-loop.webm" -vf \
	"fps=12,scale=1024:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
	"$out/core-loop.gif"
# Three phone screens side by side, split by 48 px grey bars.
ffmpeg -loglevel error -y -i "$out/mobile-list.png" -i "$out/mobile-editor.png" \
	-i "$out/mobile-tasks.png" -filter_complex \
	"[0]pad=iw+48:ih:0:0:0xd0d7de[a];[1]pad=iw+48:ih:0:0:0xd0d7de[b];[a][b][2]hstack=3" \
	"$out/mobile.png"
ls -l "$out"
