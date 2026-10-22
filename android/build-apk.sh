#!/usr/bin/env bash
# Builds the Android APK from dist/ (the same tested web build) with the plain Android build tools
# (aapt2, javac, dx, zipalign, apksigner) — no Gradle needed. On Ubuntu:
#   sudo apt-get install android-sdk-build-tools android-sdk-platform-23 apksigner zipalign aapt dalvik-exchange default-jdk-headless
# Usage: npm run build && android/build-apk.sh
# Signing: set ANDROID_KEYSTORE / ANDROID_KEYSTORE_PASS / ANDROID_KEY_ALIAS for your own release key.
# Without them a local test key is created in android/.keys/ (NOT committed, NOT shipped).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
JAR="${ANDROID_JAR:-$SDK/platforms/android-23/android.jar}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
IFS=. read -r MA MI PA <<<"$VERSION"
CODE=$((MA * 10000 + MI * 100 + PA))
OUT="$HERE/build"
test -f "$ROOT/dist/index.html" || { echo "dist/ is missing: run npm run build first"; exit 1; }
grep -q "\"$VERSION\"" <(node -p "JSON.stringify(require('$ROOT/package.json').version)")
sed -i "s/static final String VERSION = \"[^\"]*\"/static final String VERSION = \"$VERSION\"/" "$HERE/src/app/ibrahi8m/edustudio/MainActivity.java"

rm -rf "$OUT" && mkdir -p "$OUT/assets/www" "$OUT/gen" "$OUT/classes"
cp -r "$ROOT/dist/." "$OUT/assets/www/"
aapt2 compile --dir "$HERE/res" -o "$OUT/res.zip"
aapt2 link -I "$JAR" --manifest "$HERE/AndroidManifest.xml" -o "$OUT/unsigned.apk" "$OUT/res.zip" \
  --java "$OUT/gen" -A "$OUT/assets" --min-sdk-version 23 --target-sdk-version 34 \
  --version-code "$CODE" --version-name "$VERSION" --auto-add-overlay
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -encoding UTF-8 -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name '*.java') 2>&1 | grep -v "^warning\|^1 warning\|^Picked up" || true
test -f "$OUT/classes/app/ibrahi8m/edustudio/MainActivity.class"
dalvik-exchange --dex --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
zipalign -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KS="${ANDROID_KEYSTORE:-$HERE/.keys/test-key.jks}"
PASS="${ANDROID_KEYSTORE_PASS:-test-key-not-secret}"
ALIAS="${ANDROID_KEY_ALIAS:-ibrahi8m-test}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=IBRAHI8M EDU STUDIO test key" 2>/dev/null
fi
APK="$OUT/IBRAHI8M-EDU-STUDIO-$VERSION.apk"
apksigner sign --ks "$KS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --ks-key-alias "$ALIAS" --out "$APK" "$OUT/aligned.apk"
apksigner verify --verbose "$APK" | head -5
echo "APK: $APK ($(du -h "$APK" | cut -f1))"
