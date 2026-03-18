---
name: tv-voice-control
description: >-
  当用户要求发送语音指令到电视、语音控制电视播放内容、语音搜索节目、
  在电视上搜索或播放视频、通过自然语言控制电视设备时使用此 Skill。
  例如："帮我在电视上搜索小猪佩奇"、"语音控制电视播放新闻"、"我要看熊出没"。
user-invocable: true
---

# TV 语音控制

通过 `ai-openclaw-skill` 服务的 xiaotnlp 接口，将用户的自然语言语音指令发送到指定电视设备执行。

## When to Use

满足以下**任一条件**时触发本 Skill：

- 用户要求在电视上搜索、播放某个节目或内容
- 用户发出电视语音控制指令（如"我要看 xxx"、"打开 xxx"）
- 用户提到语音控制、语音搜索、AI语音、语音指令等关键词
- 用户需要通过 xiaotnlp 接口发送 NLP 指令

## Required Inputs

| 变量 | 来源 | 必填 | 说明 |
|------|------|------|------|
| `query` | 用户提供 | **是** | 语音指令文本，如"我要看小猪佩奇" |

以下参数通过 **OpenClaw 配置**注入，无需用户传递：

| 环境变量 | 说明 | 配置方式 | 备注 |
|----------|------|----------|------|
| `TCL_APPID` | 应用 ID | `~/.openclaw/openclaw.json` 中配置 | 与tcl-tv-bot 插件的appId一致|
| `TCL_APPKEY` | 应用 Key | `~/.openclaw/openclaw.json` 中配置 |与tcl-tv-bot 插件的appKey一致|


## Utility Scripts

**send_voice_command.py**：发送语音指令到电视设备。

- 零外部依赖，仅使用 Python 3 标准库
- 跨平台兼容：Windows / macOS / Linux
- 自动处理 Windows 终端中文编码
- `appId`、`appKey` 由 OpenClaw 配置自动注入

```bash
python3 scripts/send_voice_command.py --query "我要看小猪佩奇"
python3 scripts/send_voice_command.py --query "打开设置"
```

成功输出示例：
```json
{
  "status": "success",
  "requestId": "5979f4ec-eacd-4f47-bb73-099f20246254",
  "query": "我要看小猪佩奇",
  "response": { "code": 200, "message": "success", "data": "success" }
}
```

## Workflow

按以下步骤执行：

1. **确认输入参数**
   - [ ] 从用户请求中提取 `query`（语音指令文本）

2. **执行脚本发送指令**（`appId`/`appKey` 由脚本从环境变量自动读取，无需检查）
   ```bash
   python3 scripts/send_voice_command.py --query "<用户语音指令>"
   ```

3. **检查脚本输出**
   - [ ] 退出码为 0 → 发送成功，解析 JSON 输出向用户报告
   - [ ] 退出码为 1 → HTTP 错误，读取 stderr 中的错误详情
   - [ ] 退出码为 2 → 连接失败，提示用户检查服务是否可达

## API Reference

| 项目 | 值 |
|------|-----|
| 完整地址 | `http://openclaw-skill-dev.test.tclai.top/xiaotnlp/v1` |
| Method | `POST` |
| Content-Type | `application/json` |

### Request Body

| 字段 | 类型 | 必填 | 来源 | 说明 |
|------|------|------|------|------|
| requestId | String | 否 | 自动生成 | UUID 格式 |
| query | String | **是** | 用户提供 | 语音指令文本 |
| appId | String | 是 | 环境变量 `TCL_APPID` | 应用 ID |
| appKey | String | 是 | 环境变量 `TCL_APPKEY` | 应用 Key |

### Response

```json
{
  "code": 200,
  "message": "success",
  "data": "success"
}
```

## Output Format

向用户回复时使用以下格式：

```
✅ 语音指令已发送
- 指令内容: {query}
- 请求ID: {requestId}

⚠️ 注意：指令为异步处理，已提交到消息队列，电视端将稍后执行。
```

## Error Handling

| 错误情况 | 处理方式 |
|----------|----------|
| HTTP 连接失败（退出码 2） | 提示用户检查服务 `http://172.26.96.1:8080` 是否可达 |
| HTTP 400（参数校验失败） | 检查 `query` 是否为空 |
| HTTP 500（服务端错误） | 提示用户查看服务日志排查问题 |
| 用户未提供 `query` | 停止执行，向用户确认要发送的语音指令内容 |

## 常见 query 示例

| 场景 | query 示例 |
|------|-----------|
| 搜索节目 | "我要看小猪佩奇"、"搜索熊出没" |
| 频道切换 | "切换到CCTV1"、"换到湖南卫视" |
| 音量控制 | "音量调大"、"静音" |
| 播放控制 | "暂停播放"、"快进10分钟" |
| 系统操作 | "打开设置"、"返回主页" |

## 目录结构

```
tv-voice-control/
├── SKILL.md                              # Skill 定义
├── scripts/
│   └── send_voice_command.py             # 发送指令脚本（零外部依赖）
```

> 接口返回 `success` 仅表示请求已进入消息队列，不代表电视端已执行完成。
