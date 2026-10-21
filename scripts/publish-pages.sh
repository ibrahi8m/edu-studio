#!/usr/bin/env bash
# Publishes the web version (dist/) to the gh-pages branch, which GitHub Pages serves at
# https://ibrahi8m.github.io/edu-studio/ (Settings → Pages → Deploy from a branch → gh-pages).
# dist/ is published exactly as built and tested — nothing is rebuilt here.
# Usage: npm run build && npm run test:e2e && scripts/publish-pages.sh [remote]
set -euo pipefail
REMOTE="${1:-https://github.com/ibrahi8m/edu-studio}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
test -f "$ROOT/dist/index.html" && test -f "$ROOT/dist/sw.js" || { echo "dist/ is missing: run npm run build first"; exit 1; }
VERSION="$(node -p "require('$ROOT/package.json').version")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r "$ROOT/dist/." "$WORK/"
touch "$WORK/.nojekyll" # serve every file as is
cd "$WORK"
git init -q -b gh-pages
git add -A
git commit -q -m "IBRAHI8M EDU STUDIO $VERSION — web version (PWA)"
git push --force "$REMOTE" gh-pages:gh-pages
echo "Published $VERSION to gh-pages."
