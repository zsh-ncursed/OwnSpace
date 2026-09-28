#!/usr/bin/env bash
# Emit update.json for Firefox's add-on update mechanism.
#
# Firefox polls browser_specific_settings.gecko.update_url and compares the
# listed version with the installed one; on a mismatch it downloads update_link
# and installs it in place. Because the extension id never changes,
# browser.storage.local (workspaces, settings, CalDAV credentials, sync
# pairings) survives the update — no export/import dance.
#
# update_hash is mandatory in practice: Firefox refuses an unsigned update
# without a matching sha256.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
XPI="${1:-$ROOT/ownspace.xpi}"
# Served as a GitHub Release asset, so the URL is stable and always points at
# the newest published build.
BASE_URL="${2:-https://github.com/zsh-ncursed/OwnSpace/releases/download/latest}"
OUT="${3:-$ROOT/update.json}"
# Optional override: the version to advertise. Without it, the version is read
# from the manifest in the tree — wrong when CI checked out the commit before
# an auto-bump, since the xpi was signed with the bumped one.
VERSION_OVERRIDE="${4:-}"

if [ ! -f "$XPI" ]; then
  echo "update.json: $XPI not found" >&2
  exit 1
fi

# Prefer the override (the version of the archive being published); fall back
# to the manifest, which is right for a local build.
if [ -n "$VERSION_OVERRIDE" ]; then
  VERSION="$VERSION_OVERRIDE"
else
  VERSION=$(node -p "require('$ROOT/manifest.json').version")
fi
NAME=$(node -p "require('$ROOT/manifest.json').browser_specific_settings.gecko.id")
SIZE=$(stat -c '%s' "$XPI")

# sha256 of the xpi, hex-encoded, as Firefox wants it.
HASH=$(sha256sum "$XPI" | cut -d' ' -f1)

cat > "$OUT" <<EOF
{
  "addons": {
    "$NAME": {
      "updates": [
        {
          "version": "$VERSION",
          "update_link": "$BASE_URL/ownspace.xpi",
          "update_hash": "sha256:$HASH",
          "size": $SIZE
        }
      ]
    }
  }
}
EOF

echo "Wrote $OUT"
echo "  addon:    $NAME"
echo "  version:  $VERSION"
echo "  size:     $SIZE bytes"
echo "  sha256:   $HASH"
