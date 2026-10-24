#!/bin/sh
# Crop a region of the original 2007 scan (gia-pha.pdf) for proofreading.
# Usage: tools/crop.sh X Y W H out.png [scale%]   — coordinates are scan pixels (8952x6072).
# The scan is extracted from the PDF once into $TMPDIR; set SRC to use another image.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$SRC" ]; then
  SRC="${TMPDIR:-/tmp}/gia-pha-scan-000.jpg"
  [ -f "$SRC" ] || pdfimages -j "$DIR/gia-pha.pdf" "${TMPDIR:-/tmp}/gia-pha-scan" || exit 1
fi
magick "$SRC" -crop "${3}x${4}+${1}+${2}" +repage -resize "${6:-100}%" "$5"
