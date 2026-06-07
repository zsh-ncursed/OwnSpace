#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/build"
XPI="$ROOT/ownspace.xpi"

rm -rf "$OUT" "$XPI"
mkdir -p "$OUT"

cp "$ROOT/manifest.json" "$OUT/"
cp "$ROOT/newtab.html" "$OUT/"
cp -r "$ROOT/src" "$OUT/"
cp -r "$ROOT/lib" "$OUT/"
cp -r "$ROOT/background" "$OUT/"

cd "$OUT"
zip -r "$XPI" . -x "*.DS_Store"
cd "$ROOT"

rm -rf "$OUT"

echo "Built: $XPI"
echo "Size: $(du -h "$XPI" | cut -f1)"
