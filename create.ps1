# ─────────────────────────────────────────────────────────────
# create-scrum-team-workspace (PowerShell Bootstrap)
#
# 轻量引导脚本：检查 Node，通过 npx 调用 GitHub 上的本仓库生成 Scrum 团队工作区。
# 模板逻辑唯一定义在 index.mjs，不在本脚本里重复实现。
#
# Usage (remote, 推荐):
#   irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.1.0-rc.7/create.ps1 | iex
#
# Usage (remote + 项目名):
#   $env:PROJECT_NAME="my-project"; irm https://raw.githubusercontent.com/kingcicou/create-scrum-team-workspace/v1.1.0-rc.7/create.ps1 | iex
#
# Usage (local clone):
#   .\create.ps1 my-project --type=new --preset=tech
#
# 所有 CLI 参数透传给 index.mjs，详见 README.md。
# ─────────────────────────────────────────────────────────────

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Repo = "kingcicou/create-scrum-team-workspace"
$Ref  = if ($env:SCRUM_TEMPLATE_REF) { $env:SCRUM_TEMPLATE_REF } else { "v1.1.0-rc.7" }

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Scrum Team Workspace Initializer" -ForegroundColor Cyan
Write-Host " PowerShell bootstrap → npx github:$Repo" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 未检测到 Node.js。请先安装 Node.js >= 24：https://nodejs.org/" -ForegroundColor Red
    return
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 24) {
    Write-Host "[ERROR] Node.js 版本过低（当前 $(node -v)），需要 >= 24。" -ForegroundColor Red
    return
}

# 2. 检查 npx
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] 未检测到 npx。请升级 npm 或重装 Node.js。" -ForegroundColor Red
    return
}

Write-Host "[INFO] Node $(node -v) 检测通过，调用 npx github:${Repo}#${Ref} ..." -ForegroundColor Green
Write-Host ""

# 3. 收集参数
#    a. dot-source 模式 (irm | iex)：$args 通常为空；用 $env:PROJECT_NAME 与 $env:SCRUM_TEMPLATE_ARGS 兜底
#    b. 本地脚本模式：$args 即为 .\create.ps1 后的全部参数
$invokeArgs = @()

if ($args -and $args.Count -gt 0) {
    $invokeArgs = $args
} else {
    if ($env:PROJECT_NAME) { $invokeArgs += $env:PROJECT_NAME }
    if ($env:SCRUM_TEMPLATE_ARGS) {
        # 简单按空格切，复杂参数请改用本地脚本模式
        $invokeArgs += ($env:SCRUM_TEMPLATE_ARGS -split '\s+')
    }
}

# 4. 透传给 npx
& npx -y "github:${Repo}#${Ref}" @invokeArgs
$exit = $LASTEXITCODE

# 清理 env
$env:PROJECT_NAME = $null
$env:SCRUM_TEMPLATE_ARGS = $null

if ($exit -ne 0) {
    Write-Host "[ERROR] 生成失败，退出码 $exit。" -ForegroundColor Red
    exit $exit
}
