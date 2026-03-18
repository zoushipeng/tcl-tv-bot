#!/usr/bin/env python3
"""
TV 语音控制指令发送脚本（跨平台：Windows / macOS / Linux）

环境变量（由 OpenClaw 配置自动注入）:
    TCL_APPID   - 应用ID
    TCL_APPKEY  - 应用Key

用法:
    python3 scripts/send_voice_command.py --query "我要看小猪佩奇"
    python3 scripts/send_voice_command.py --query "打开设置"
"""

import argparse
import io
import json
import os
import sys
import uuid
from urllib import request, error

BASE_URL = "http://openclaw-skill-dev.test.tclai.top"


def _ensure_utf8_stdio():
    """确保 stdout/stderr 使用 UTF-8 编码，解决 Windows 终端中文乱码问题"""
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def _print_json(data: dict, file=None):
    """输出 JSON，确保中文正常显示"""
    print(json.dumps(data, ensure_ascii=False, indent=2), file=file or sys.stdout)


def send_voice_command(query: str, request_id: str = None):
    req_id = request_id or str(uuid.uuid4())

    payload = json.dumps({
        "requestId": req_id,
        "query": query,
        "appId": os.environ.get("TCL_APPID", ""),
        "appKey": os.environ.get("TCL_APPKEY", "")
    }).encode("utf-8")

    url = f"{BASE_URL}/xiaotnlp/v1"
    req = request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            _print_json({
                "status": "success",
                "requestId": req_id,
                "query": query,
                "response": body
            })
            return 0
    except error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        _print_json({
            "status": "error",
            "httpCode": e.code,
            "message": err_body,
            "query": query
        }, file=sys.stderr)
        return 1
    except error.URLError as e:
        _print_json({
            "status": "error",
            "message": f"连接失败: {e.reason}",
            "url": url
        }, file=sys.stderr)
        return 2


def main():
    _ensure_utf8_stdio()

    parser = argparse.ArgumentParser(description="发送语音指令到电视设备")
    parser.add_argument("--query", required=True, help="语音指令文本，如 '我要看小猪佩奇'")
    parser.add_argument("--request-id", default=None, help="请求ID，不传则自动生成 UUID")
    args = parser.parse_args()

    sys.exit(send_voice_command(args.query, args.request_id))


if __name__ == "__main__":
    main()
