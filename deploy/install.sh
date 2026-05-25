#!/bin/bash
# 安装 wechat-bridge user-level systemd 服务
# 使用方式: bash deploy/install.sh

set -e

SERVICE_NAME="wechat-bridge"
SERVICE_FILE="$(dirname "$0")/wechat-bridge.service"
TARGET_DIR="$HOME/.config/systemd/user"

echo ">>> 安装 $SERVICE_NAME 服务..."

mkdir -p "$TARGET_DIR"
cp "$SERVICE_FILE" "$TARGET_DIR/$SERVICE_NAME.service"

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user start "$SERVICE_NAME"

echo ">>> 服务已安装并启动"
echo "    查看状态: systemctl --user status $SERVICE_NAME"
echo "    查看日志: journalctl --user -u $SERVICE_NAME -f"
echo "    停止服务: systemctl --user stop $SERVICE_NAME"
echo "    重启服务: systemctl --user restart $SERVICE_NAME"
