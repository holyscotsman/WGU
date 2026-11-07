#!/usr/bin/env bash
# WGU Study launcher: double-click (macOS) or run `bash start.command`.
# Installs dependencies, builds, remembers your password, starts the site locally, opens the browser.
set -u
# Homebrew (Apple silicon and Intel) installs node here; a fresh Terminal may not have it on PATH yet
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
PORT=8888
URL="http://localhost:$PORT"
CLI="netlify-cli@27.16.1"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; printf 'Press Enter to close.'; read -r _; exit 1; }

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  command -v open >/dev/null 2>&1 && open "https://nodejs.org"
  die "Node.js is not installed. Install the LTS version from https://nodejs.org, then run this again."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js $(node -v) is too old. Install the current LTS from https://nodejs.org."

# 2. Latest code (only works if this folder is a git clone; a downloaded ZIP is skipped)
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  say "Checking for updates"
  git pull --ff-only 2>&1 | tail -2 || echo "Could not update; continuing with the current version."
fi

# 3. Dependencies and build (also validates the course content)
say "Installing dependencies"
npm install --no-audit --no-fund --loglevel=error || die "npm install failed."
say "Building"
npm run --silent build || die "Build failed. Send the error above to Claude."

# 4. Password and session secret, saved once in .local.env (never committed)
if [ ! -f .local.env ]; then
  say "First-time setup"
  printf 'Choose a password for the site: '
  read -r -s PW; echo
  [ -n "$PW" ] || die "Password cannot be empty."
  SECRET=$(node -p 'require("crypto").randomBytes(36).toString("base64")')
  printf 'APP_PASSWORD=%q\nSESSION_SECRET=%q\n' "$PW" "$SECRET" > .local.env
  chmod 600 .local.env
  echo "Saved. To change the password later, delete the file .local.env and run this again."
fi
set -a; . ./.local.env; set +a

# 5. Start the site; open the browser once it answers
say "Starting WGU Study at $URL  (press Ctrl+C to stop)"
(
  for _ in $(seq 1 90); do
    if curl -fs -o /dev/null "$URL/api/auth" 2>/dev/null; then
      if [ "$(uname)" = "Darwin" ] && [ -d "/Applications/Google Chrome.app" ]; then open -a "Google Chrome" "$URL"
      elif command -v open >/dev/null 2>&1; then open "$URL"
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
      fi
      exit 0
    fi
    sleep 1
  done
) &
export NETLIFY_DEV_NO_UPDATE_CHECK=1
npx --yes "$CLI" dev --offline --port "$PORT" --no-open
