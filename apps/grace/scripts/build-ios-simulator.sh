#!/usr/bin/env bash
set -euo pipefail
grace_root="$(cd "$(dirname "$0")/.." && pwd)"
grace_derived="$(mktemp -d /private/tmp/grace-ios-derived.XXXXXX)"
xcodebuild -project "$grace_root/ios/Grace.xcodeproj" -scheme Grace -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath "$grace_derived" CODE_SIGNING_ALLOWED=NO build
mkdir -p "$grace_root/outputs"
ditto -c -k --sequesterRsrc --keepParent "$grace_derived/Build/Products/Debug-iphonesimulator/Grace.app" "$grace_root/outputs/Grace-ios-simulator.zip"
echo "$grace_root/outputs/Grace-ios-simulator.zip"
