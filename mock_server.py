#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Music Showcase · 志工認領 — Apps Script 的本機模擬後端
Local mock of the Apps Script backend, byte-for-byte the same JSON contract.

用途 / Why:
  在還沒部署 Google Apps Script 之前，先用這個在本機把「雲端模式」跑起來驗證。
  也可以拿來當作日後功能調整的回歸測試工具。

跑法 / Run:
    python3 mock_server.py            # http://localhost:8899
    python3 mock_server.py 9000       # 換 port

網址 / URLs:
    /             → index.html（本機模式）
    /cloud.html   → index.html 自動把 CONFIG.API_URL 指到 /api（雲端模式）
    /api?action=list   (GET)
    /api               (POST，同 Apps Script 的 doPost)
"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "mock_db.json")
SEED_PATH = os.path.join(ROOT, "seed.json")

LOCK = threading.Lock()

HEADERS = ['id', 'cat', 'title_zh', 'title_en', 'desc_zh', 'desc_en',
           'skills_zh', 'skills_en', 'date', 'time', 'place_zh', 'place_en',
           'slots', 'contact', 'claimants']


# --------------------------------------------------------------------- store

def load_db():
    if os.path.exists(DB_PATH):
        with open(DB_PATH, encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists(SEED_PATH):
        with open(SEED_PATH, encoding="utf-8") as f:
            return json.load(f)
    return []


def save_db(data):
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


DB = load_db()


def find(db, nid):
    for n in db:
        if str(n.get("id")) == str(nid):
            return n
    return None


def public_view(lst):
    """對外檢視：拿掉認領人的 contact / note（與 Apps Script 的 publicView_ 一致）"""
    out = []
    for n in lst or []:
        c = dict(n)
        c["claimants"] = [
            {"name": x.get("name", ""), "avail": x.get("avail", ""), "at": x.get("at", "")}
            for x in (n.get("claimants") or [])
        ]
        out.append(c)
    return out


def PUB():
    return public_view(DB)


# ------------------------------------------------------------------- actions

def act_claim(body):
    p = body.get("person") or {}
    name = str(p.get("name", "")).strip()
    contact = str(p.get("contact", "")).strip()
    if not name or not contact:
        return {"ok": False, "error": "missing name/contact"}

    n = find(DB, body.get("id"))
    if n is None:
        return {"ok": False, "error": "task not found"}

    claimants = n.setdefault("claimants", [])
    if len(claimants) >= int(n.get("slots") or 1):
        return {"ok": False, "error": "full"}
    if any(str(c.get("name", "")).lower() == name.lower() for c in claimants):
        return {"ok": False, "error": "duplicate"}

    claimants.append({
        "name": name, "contact": contact,
        "avail": str(p.get("avail", "")), "note": str(p.get("note", "")),
        "at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    })
    save_db(DB)
    return {"ok": True, "need": public_view([n])[0], "needs": PUB()}


def act_unclaim(body):
    n = find(DB, body.get("id"))
    if n is None:
        return {"ok": False, "error": "task not found"}

    claimants = n.setdefault("claimants", [])
    idx = body.get("index")
    if body.get("name"):
        for i, c in enumerate(claimants):
            if str(c.get("name", "")).lower() == str(body["name"]).lower():
                idx = i
                break
    try:
        idx = int(idx)
    except (TypeError, ValueError):
        return {"ok": False, "error": "claimant not found"}
    if idx < 0 or idx >= len(claimants):
        return {"ok": False, "error": "claimant not found"}

    claimants.pop(idx)
    save_db(DB)
    return {"ok": True, "need": public_view([n])[0], "needs": PUB()}


def act_add(body):
    n = body.get("need") or {}
    if not n.get("id"):
        n["id"] = "n" + format(int(time.time() * 1000), "x")
    if find(DB, n["id"]) is not None:
        return {"ok": False, "error": "id already exists"}
    n.setdefault("claimants", [])
    DB.insert(0, n)
    save_db(DB)
    return {"ok": True, "need": public_view([n])[0], "needs": PUB()}


def act_replace_all(body):
    global DB
    lst = body.get("needs")
    if not isinstance(lst, list):
        return {"ok": False, "error": "needs must be an array"}

    # 保留雲端既有的 contact / note（前端公開資料沒有這些欄位）
    existing = {str(n.get("id")): n for n in DB}
    for n in lst:
        prev = existing.get(str(n.get("id")))
        if not prev:
            continue
        by_name = {str(c.get("name", "")).lower(): c for c in (prev.get("claimants") or [])}
        merged = []
        for c in (n.get("claimants") or []):
            old = by_name.get(str(c.get("name", "")).lower())
            if not old:
                merged.append(c)
                continue
            merged.append({
                "name": c.get("name", ""),
                "contact": c.get("contact") or old.get("contact", ""),
                "avail": c.get("avail") or old.get("avail", ""),
                "note": c.get("note") or old.get("note", ""),
                "at": c.get("at") or old.get("at", ""),
            })
        n["claimants"] = merged

    DB = lst
    save_db(DB)
    return {"ok": True, "needs": PUB()}


def act_init(body):
    if DB:
        return {"ok": True, "needs": PUB(), "skipped": True}
    return act_replace_all(body)


ACTIONS = {
    "claim": act_claim,
    "unclaim": act_unclaim,
    "add": act_add,
    "replaceAll": act_replace_all,
    "init": act_init,
}


# -------------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    server_version = "MusicShowcaseMock/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    def _send(self, code, body, ctype):
        raw = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8")

    def do_GET(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)

        if path in ("/api", "/api/"):
            action = (qs.get("action") or ["list"])[0]
            with LOCK:
                if action in ("list", "ping"):
                    return self._json({"ok": True, "needs": PUB()})
            return self._json({"ok": False, "error": "unknown action: " + action})

        if path in ("/", "/index.html"):
            return self._send_file("index.html", "text/html; charset=utf-8",
                                   inject_api=False)

        if path == "/cloud.html":
            return self._send_file("index.html", "text/html; charset=utf-8",
                                   inject_api=True)

        if path == "/seed.json":
            return self._send_file("seed.json", "application/json; charset=utf-8")

        return self._send(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api", "/api/"):
            return self._send(404, "not found", "text/plain; charset=utf-8")

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw)
        except Exception as exc:
            return self._json({"ok": False, "error": "bad json: %s" % exc})

        action = body.get("action")
        fn = ACTIONS.get(action)
        if fn is None:
            return self._json({"ok": False, "error": "unknown action: %s" % action})

        with LOCK:
            return self._json(fn(body))

    def _send_file(self, name, ctype, inject_api=False):
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            return self._send(404, "missing " + name, "text/plain; charset=utf-8")
        with open(p, encoding="utf-8") as f:
            html = f.read()
        if inject_api:
            html = html.replace("API_URL: ''", "API_URL: '/api'")
            if "API_URL: '/api'" not in html:
                return self._send(500, "could not inject API_URL", "text/plain; charset=utf-8")
        return self._send(200, html, ctype)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("Music Showcase mock backend on http://localhost:%d" % port)
    print("  本機模式 : http://localhost:%d/" % port)
    print("  雲端模式 : http://localhost:%d/cloud.html" % port)
    print("  DB       : %s (%d needs)" % (DB_PATH, len(DB)))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
