#!/bin/sh
# Run from the repository root. Captures go to test-results/<project>/screenshots.
set -eu
if [ "$#" -eq 0 ]; then
  exec env CONTAINED_PROFILE=screenshots scripts/run-contained.sh browser
fi
[ "$#" -eq 2 ] && [ "$1" = --render ] || { echo "Usage: $0" >&2; exit 2; }
out=$2

# Two-pass palette GIF: 1024 px wide, 12 fps.
ffmpeg -loglevel error -y -i "$out/core-loop.webm" -vf \
	"fps=12,scale=1024:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
	"$out/core-loop.gif"
# Three phone screens side by side, split by 48 px grey bars.
ffmpeg -loglevel error -y -i "$out/mobile-folders.png" -i "$out/mobile-list.png" \
	-i "$out/mobile-editor.png" -filter_complex \
	"[0]pad=iw+48:ih:0:0:0xd0d7de[a];[1]pad=iw+48:ih:0:0:0xd0d7de[b];[a][b][2]hstack=3" \
	"$out/mobile.png"
ls -l "$out"
