#!/bin/bash
# DeskGitHub 一键打包（按当前系统选择目标）
cd "$(dirname "$0")" || exit 1

pause() {
  if [ -t 0 ]; then
    echo
    read -n 1 -s -r -p "按任意键关闭窗口…"
    echo
  fi
}

echo "======================================"
echo " DeskGitHub — 一键打包"
echo "======================================"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未检测到 Node.js。"
  echo "请先安装 Node.js（建议 20 或更高版本）：https://nodejs.org"
  pause
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次打包，正在安装依赖…"
  if ! npm install; then
    echo "依赖安装失败，请检查网络后重试。"
    pause
    exit 1
  fi
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

case "$(uname -s)" in
  Darwin) TARGET="dist:mac"; LABEL="macOS" ;;
  Linux) TARGET="dist:linux"; LABEL="Linux" ;;
  MINGW*|MSYS*|CYGWIN*) TARGET="dist:win"; LABEL="Windows" ;;
  *) TARGET="dist"; LABEL="当前系统" ;;
esac

echo
echo "检测到系统：$LABEL"
echo "开始打包：npm run $TARGET"
echo

if npm run "$TARGET"; then
  echo
  echo "打包完成，产物位于 release/ 目录。"
  if command -v open >/dev/null 2>&1; then
    open release 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open release 2>/dev/null || true
  fi
  pause
else
  echo
  echo "打包失败，请查看上方日志。"
  echo "提示：Windows / Linux 安装包建议在对应系统上打包。"
  pause
  exit 1
fi
