#!/usr/bin/env bash
# Auto uninstall+reinstall the latest finished EAS iOS build onto every
# USB-tethered iPhone whose UDID is in the project's dev provisioning
# profile. Idempotent — safe to call after every `eas build`.
#
# Usage:
#   scripts/install-build.sh                    # uses latest finished iOS build
#   scripts/install-build.sh <build-id>         # uses specific build
#   scripts/install-build.sh <path-to-ipa>      # uses local IPA file
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMD="$REPO/.secrets/imd"
IPA_DIR="$REPO/.secrets/ipa"
BUNDLE_ID="ai.dopamenu.app"

mkdir -p "$IPA_DIR"

# 1. Locate libimobiledevice binaries (idempotent download if missing)
if [ ! -x "$IMD/idevice_id.exe" ] && [ ! -x "$IMD/idevice_id" ]; then
  echo "==> libimobiledevice not found, downloading..."
  mkdir -p "$IMD"
  curl -sLo "$IMD/libimd.zip" "https://github.com/libimobiledevice-win32/imobiledevice-net/releases/download/v1.3.17/libimobiledevice.1.2.1-r1122-win-x64.zip"
  ( cd "$IMD" && unzip -q -o libimd.zip && rm libimd.zip )
fi

IDEV_ID="$IMD/idevice_id.exe"
IDEV_INSTALL="$IMD/ideviceinstaller.exe"
[ -x "$IMD/idevice_id" ] && IDEV_ID="$IMD/idevice_id"
[ -x "$IMD/ideviceinstaller" ] && IDEV_INSTALL="$IMD/ideviceinstaller"

# 2. Resolve IPA — local file, build ID, or latest finished iOS build
ARG="${1:-}"
IPA=""
if [ -n "$ARG" ] && [ -f "$ARG" ]; then
  IPA="$ARG"
elif [ -n "$ARG" ]; then
  echo "==> Fetching build $ARG..."
  URL=$(eas build:view "$ARG" --json 2>/dev/null | python -c "
import json,re,sys
raw=sys.stdin.read(); m=re.search(r'\{.*\}',raw,re.DOTALL); d=json.loads(m.group(0))
print((d.get('artifacts') or {}).get('applicationArchiveUrl',''))")
  [ -z "$URL" ] && { echo "Build $ARG has no IPA artifact"; exit 1; }
  IPA="$IPA_DIR/dopamenu-$ARG.ipa"
  curl -sLo "$IPA" "$URL"
else
  echo "==> Locating latest FINISHED iOS build..."
  LATEST=$(eas build:list --platform ios --status finished --limit 1 --json --non-interactive 2>/dev/null | python -c "
import json,sys,re
raw=sys.stdin.read(); m=re.search(r'\[.*\]',raw,re.DOTALL); arr=json.loads(m.group(0))
if not arr: sys.exit('no finished iOS builds')
b=arr[0]; print(b['id']); print((b.get('artifacts') or {}).get('applicationArchiveUrl',''))")
  BID=$(echo "$LATEST" | sed -n 1p)
  URL=$(echo "$LATEST" | sed -n 2p)
  [ -z "$URL" ] && { echo "No IPA URL on build $BID"; exit 1; }
  IPA="$IPA_DIR/dopamenu-$BID.ipa"
  if [ ! -f "$IPA" ]; then
    echo "    downloading $URL"
    curl -sLo "$IPA" "$URL"
  fi
  echo "    IPA: $IPA"
fi

# 3. Find tethered iPhones
DEVICES=$("$IDEV_ID" -l 2>/dev/null | tr -d '\r' | grep -v '^$' || true)
if [ -z "$DEVICES" ]; then
  echo "No iPhone detected over USB. Plug one in and rerun."
  exit 1
fi

# 4. Uninstall + install on each
while IFS= read -r udid; do
  [ -z "$udid" ] && continue
  echo
  echo "==> Device $udid"
  echo "    Uninstalling $BUNDLE_ID..."
  "$IDEV_INSTALL" -u "$udid" --uninstall "$BUNDLE_ID" 2>&1 | sed 's/^/      /' || true
  echo "    Installing $(basename "$IPA")..."
  "$IDEV_INSTALL" -u "$udid" --install "$IPA" 2>&1 | sed 's/^/      /'
done <<< "$DEVICES"

echo
echo "Done."
