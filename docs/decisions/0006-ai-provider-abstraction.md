# AI 供应商接入决策

## 决策

AI 采集接口采用 OpenAI-compatible Chat Completions 协议，通过环境变量配置供应商、模型和 API Key。

```text
AI_API_BASE_URL
AI_API_KEY
AI_MODEL
```

## 原因

- DeepSeek、通义千问和其他兼容服务可以使用同一套代码。
- API Key 只保存在服务端环境变量中。
- 更换供应商时不需要修改前端界面和数据库结构。
- 不需要引入额外 SDK，使用 Node.js 原生 `fetch`。
- 输入内容只在用户主动点击“开始识别”后发送。

## 数据安全

1. AI API Key 不得出现在浏览器代码或 Git 中。
2. AI 返回结果必须经过服务端字段和长度校验。
3. AI 结果不得直接保存，必须先进入编辑器由用户确认。
4. AI 服务不可用时，原始输入不得丢失。
5. 不记录完整提示词内容到应用日志。

## 当前状态

- 智能采集界面已完成。
- AI 调用接口已完成。
- 结果解析和编辑器预填已完成。
- 当前供应商为 DeepSeek，模型为 `deepseek-flash`。
- API Key、结构化识别和登录保护已经完成真实测试。

