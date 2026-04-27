#!/bin/bash
# Post-build script to hide .VolumeIcon.icns in the DMG.
# Usage: ./scripts/fix-dmg.sh
set -euo pipefail

DMG_DIR="src-tauri/target/release/bundle/dmg"
DMG=$(find "$DMG_DIR" -name '*.dmg' -print -quit 2>/dev/null)

if [ -z "$DMG" ]; then
  echo "No DMG found in $DMG_DIR"
  exit 1
fi

echo "Fixing DMG: $DMG"

# Create a writable copy
WRITABLE="/tmp/turbine-rw.dmg"
hdiutil convert "$DMG" -format UDRW -o "$WRITABLE" -quiet
MOUNT_POINT=$(hdiutil attach "$WRITABLE" -mountpoint /tmp/turbine-dmg -nobrowse -quiet | tail -1 | awk '{print $NF}')

# Hide the volume icon file
if [ -f "$MOUNT_POINT/.VolumeIcon.icns" ]; then
  SetFile -a V "$MOUNT_POINT/.VolumeIcon.icns" 2>/dev/null || chflags hidden "$MOUNT_POINT/.VolumeIcon.icns"
  echo "Hidden .VolumeIcon.icns"
fi

# Unmount and convert back to read-only compressed DMG
hdiutil detach "$MOUNT_POINT" -quiet
FINAL="/tmp/turbine-final.dmg"
hdiutil convert "$WRITABLE" -format UDZO -o "$FINAL" -quiet

# Replace original
mv "$FINAL" "$DMG"
rm -f "$WRITABLE"

echo "Done: $DMG"
