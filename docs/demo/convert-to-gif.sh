#!/bin/bash
# Convert a .mov screen recording to an optimized GIF
# Usage: ./convert-to-gif.sh input.mov output.gif [width]
#
# Defaults to 960px wide. For README hero, use 960.
# For smaller inline demos, use 640.

INPUT="$1"
OUTPUT="$2"
WIDTH="${3:-960}"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 input.mov output.gif [width]"
  exit 1
fi

# Two-pass for smaller file: generate palette, then use it
PALETTE="/tmp/palette.png"

ffmpeg -y -i "$INPUT" \
  -vf "fps=15,scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE"

ffmpeg -y -i "$INPUT" -i "$PALETTE" \
  -lavfi "fps=15,scale=${WIDTH}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$OUTPUT"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "Created $OUTPUT ($SIZE)"
