#!/bin/bash
set -e

REPO_URL="https://github.com/rankgnar/opskrew.git"
INSTALL_DIR="/opt/opskrew"

# ── Spinner helper ───────────────────────────────────────
spin() {
  local pid=$1 msg=$2
  local frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  tput civis 2>/dev/null || true
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  %s %s" "${frames:i%${#frames}:1}" "$msg"
    i=$((i + 1))
    sleep 0.1
  done
  wait "$pid" 2>/dev/null
  local rc=$?
  tput cnorm 2>/dev/null || true
  if [ $rc -eq 0 ]; then
    printf "\r  ✓ %s\n" "$msg"
  else
    printf "\r  ✗ %s (failed)\n" "$msg"
    return $rc
  fi
}

# ── Header ───────────────────────────────────────────────
echo ""
echo "  opskrew installer"
echo "  Your AI Assistant. Your Server. Your Rules."
echo "  ──────────────────────────────────────────────"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "  Warning: not running as root. Some steps may require sudo."
  echo ""
fi

# ── Step 1: System dependencies ──────────────────────────
echo "  [1/5] System dependencies"
if command -v apt-get &>/dev/null; then
  (apt-get update -qq && apt-get install -y build-essential curl git > /dev/null 2>&1) &
  spin $! "Installing build tools..."
elif command -v yum &>/dev/null; then
  (yum install -y gcc-c++ make curl git > /dev/null 2>&1) &
  spin $! "Installing build tools..."
else
  echo "  ✓ Skipped (unknown package manager)"
fi

# ── Step 2: Node.js ─────────────────────────────────────
echo "  [2/5] Node.js"
if ! command -v node &>/dev/null || [[ $(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  if command -v apt-get &>/dev/null; then
    (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1 && apt-get install -y nodejs > /dev/null 2>&1) &
    spin $! "Installing Node.js 22..."
  else
    echo "  Please install Node.js 22+ manually: https://nodejs.org"
    exit 1
  fi
  echo "  ✓ Node.js $(node -v) ready"
else
  echo "  ✓ Node.js $(node -v) already installed"
fi

# ── Step 3: PM2 ─────────────────────────────────────────
echo "  [3/5] Process manager"
if ! command -v pm2 &>/dev/null; then
  (npm install -g pm2 > /dev/null 2>&1) &
  spin $! "Installing PM2..."
else
  echo "  ✓ PM2 already installed"
fi

# ── Step 4: Clone ───────────────────────────────────────
echo "  [4/5] Download opskrew"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Existing install found, updating..."
  cd "$INSTALL_DIR"
  (git pull origin main > /dev/null 2>&1) &
  spin $! "Pulling latest..."
else
  (git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" > /dev/null 2>&1) &
  spin $! "Cloning repository..."
  cd "$INSTALL_DIR"
fi

# ── Step 5: Build ───────────────────────────────────────
echo "  [5/5] Build"
(npm install > /dev/null 2>&1) &
spin $! "Installing dependencies..."

(npm run build > /dev/null 2>&1) &
spin $! "Compiling TypeScript..."

# Symlink
if [ -L /usr/local/bin/opskrew ]; then
  rm /usr/local/bin/opskrew
fi
ln -sf "$INSTALL_DIR/dist/index.js" /usr/local/bin/opskrew
chmod +x "$INSTALL_DIR/dist/index.js"

# PM2 startup
pm2 startup > /dev/null 2>&1 || true

# ── Done ─────────────────────────────────────────────────
echo ""
echo "  ──────────────────────────────────────────────"
echo ""
echo "  opskrew installed successfully."
echo ""
echo "  Your AI assistant includes:"
echo ""
echo "    AI         9 providers (Anthropic, OpenAI, Gemini, DeepSeek...)"
echo "    Channels   Telegram, Discord, WhatsApp"
echo "    Memory     Persistent conversations and knowledge base"
echo "    Tools      Web search, vision, document reading, reminders"
echo "    Skills     Extensible skill system (AgentSkills compatible)"
echo "    Team       Built-in agents (researcher, coder, writer)"
echo "    Dashboard  Web UI with usage tracking and settings"
echo "    Updates    Automatic background updates"
echo ""
echo "  Get started:"
echo "    opskrew setup     Configure your assistant"
echo "    opskrew start     Launch it"
echo "    opskrew status    Check if it's running"
echo ""
echo "  ──────────────────────────────────────────────"
echo ""
