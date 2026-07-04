#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# create-scrum-team-workspace (Bash Bootstrap)
#
# 轻量引导脚本：检查 Node，通过 npx 调用 GitHub 上的本仓库生成 Scrum 团队工作区。
# 模板逻辑唯一定义在 index.mjs，不在本脚本里重复实现。
#
# Usage (remote, 推荐):
#   bash <(curl -fsSL https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v0.10.1/create.sh) my-project
#
# Usage (local clone):
#   ./create.sh my-project --type=new --preset=tech
#
# 所有 CLI 参数透传给 index.mjs，详见 README.md。
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="kingcicou/create-scrum-team-workspace"
REF="${SCRUM_TEMPLATE_REF:-v0.10.1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}  Scrum Team Workspace Initializer           ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}  bash bootstrap → npx github:${REPO}  ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
}

die()  { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${GREEN}[INFO]${NC} $1"; }

banner

# 1. 检查 Node
if ! command -v node >/dev/null 2>&1; then
  die "未检测到 Node.js。请先安装 Node.js >= 18：https://nodejs.org/"
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js 版本过低（当前 v$(node -v | sed 's/^v//')），需要 >= 18。"
fi

# 2. 检查 npx
if ! command -v npx >/dev/null 2>&1; then
  die "未检测到 npx。请升级 npm 或重装 Node.js。"
fi

info "Node $(node -v) 检测通过，调用 npx github:${REPO}#${REF} ..."
echo ""

# 3. 透传所有参数给 index.mjs
exec npx -y "github:${REPO}#${REF}" "$@"
