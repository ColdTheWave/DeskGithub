#!/bin/bash
# DeskGitHub — Windows 打包（x64 + arm64，NSIS 安装包 + 便携版）
cd "$(dirname "$0")" || exit 1

pause() {
  if [ -t 0 ]; then
    echo
    read -n 1 -s -r -p "按任意键关闭窗口…"
    echo
  fi
}

echo "======================================"
echo " DeskGitHub — Windows 打包"
echo " 产物：release/ 下的 exe 安装包与便携版"
echo " 建议在 Windows 系统上运行本脚本"
echo "======================================"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未检测到 Node.js。请先安装：https://nodejs.org"
  pause
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次打包，正在安装依赖…"
  npm install || { echo "依赖安装失败。"; pause; exit 1; }
fi

CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
echo
echo "当前版本：$CURRENT_VERSION"
read -r -p "请输入新版本号（直接回车沿用当前版本）：" INPUT_VERSION
if [ -n "$INPUT_VERSION" ]; then
  if ! node scripts/set-version.mjs "$INPUT_VERSION"; then
    echo "版本号设置失败，打包已取消。"
    pause
    exit 1
  fi
fi
echo

if npm run dist:win; then
  echo
  echo "打包完成，产物位于 release/。"
  if command -v open >/dev/null 2>&1; then open release 2>/dev/null || true; fi
  if command -v explorer >/dev/null 2>&1; then explorer release 2>/dev/null || true; fi
  pause
else
  echo
  echo "打包失败，请查看上方日志。"
  echo "如提示缺少签名工具或 Wine，请在 Windows 上直接运行本脚本。"
  pause
  exit 1
fi
