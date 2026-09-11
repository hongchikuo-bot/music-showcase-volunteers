#!/bin/bash
# ============================================================
#  Music Showcase 志工認領網站 — 本機啟動器
#  雙擊這個檔案就會：啟動伺服器 + 自動打開瀏覽器
#  要停止：把這個黑色視窗關掉，或在視窗裡按 Control + C
# ============================================================

cd "$(dirname "$0")" || exit 1
PORT=8899

echo "================================================"
echo "  Music Showcase  志工認領網站"
echo "================================================"
echo ""

# 先清掉可能卡住的舊伺服器
OLD=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$OLD" ]; then
  echo "關閉舊的伺服器 (PID $OLD)..."
  echo "$OLD" | xargs kill -9 2>/dev/null
  sleep 1
fi

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo "啟動中..."
echo ""
echo "  🖥  這台電腦打開：http://localhost:$PORT/cloud.html"
if [ -n "$LAN_IP" ]; then
echo "  📱 手機／平板打開：http://$LAN_IP:$PORT/cloud.html"
echo "      （手機要和這台電腦連同一個 Wi-Fi）"
fi
echo ""
echo "  首頁 = 雲端模式示範（狀態燈會是綠色的『雲端已連線』）"
echo "  想看單純的本機模式：http://localhost:$PORT/"
echo ""
echo "  ⚠️  這個視窗要開著網站才連得上。關掉視窗＝關掉網站。"
echo "================================================"
echo ""

# 等伺服器起來後自動開瀏覽器
( sleep 2; open "http://localhost:$PORT/cloud.html" ) &

python3 mock_server.py "$PORT"
