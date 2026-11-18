# soqq-wechat-search

**微信公众号文章检索 MCP 工具** —— 基于腾讯搜索 [so.qq.com](https://so.qq.com)（元宝索引）的「公众号」tab，返回真实 `mp.weixin.qq.com` 原文链接。**无需微信登录、无需任何 API Key。**

An MCP server for searching WeChat official account (公众号) articles via Tencent's search (so.qq.com / Yuanbao index). Returns real article links, account names, relative publish time and snippets. No login, no API key.

## 为什么用它

| 方案 | 局限 |
|---|---|
| 搜狗微信搜索 | 按相关度返回子集，无法枚举公众号历史文章；反爬严格 |
| 微信搜一搜 | 只能在微信客户端内人工使用 |
| **so.qq.com 公众号 tab（本项目）** | 元宝索引背书，信源全；免登录；带时间筛选；每页约 25 条可滚动加载 |

典型用途：枚举某个公众号的历史文章时间线、追踪话题相关文章、为 RAG / 素材库自动汇入微信内容。

## 提供 MCP 工具

`soqq_wechat_search`

| 参数 | 类型 | 说明 |
|---|---|---|
| `query` | string | 检索关键词，如 `"Motubrain 开源"` |
| `scrolls` | number? | 额外滚动加载次数，每轮约 +25 条（默认 2） |

返回字段：`title` / `url`（真实原文链接）/ `source`（公众号名）/ `date`（相对时间，如"1天前"）/ `snippet`。

## 接入方式

### 通用 MCP 配置（WorkBuddy / Claude Desktop / Cursor / Cherry Studio 等）

```json
{
  "mcpServers": {
    "soqq-wechat-search": {
      "command": "npx",
      "args": ["-y", "soqq-wechat-search-mcp"]
    }
  }
}
```

> 本地开发时 `command` 用 `node`，`args` 指向 `src/server.js`。

### 命令行（CLI）

```bash
npx soqq-wechat-search "生数科技 训练报告" 2 out.json
# 参数: 关键词 [scrolls] [输出文件]，不带输出文件则打印到 stdout
```

### 编程调用

```js
const { search } = require('soqq-wechat-search/src/search');
const data = await search({ query: '关键词', scrolls: 2 });
```

## 环境要求

- Node.js ≥ 18
- 系统装有 **Microsoft Edge** 或 **Chrome**（使用 `playwright-core` 复用系统浏览器，**无需下载浏览器内核**）
  - 可用环境变量 `PLAYWRIGHT_CHANNEL` 强制指定（`msedge` / `chrome`）

## 实现原理

1. 启动系统浏览器（headless）访问 `https://so.qq.com/isearch?tab=weixin_article&query=<关键词>`
2. 等待 `article.result-card` 渲染，滚动加载更多
3. 从卡片提取「公众号名 + 相对时间 + 标题 + 摘要 + 真实链接」，按 `sn/mid/idx` 去重
4. 全程无需登录——`tab=weixin_article` 是公开页面

## 合规与限制（请务必阅读）

- 本项目通过驱动公开网页获取结果，**仅供个人学习与研究**。so.qq.com 的服务条款由腾讯制定，若用于商业用途请自行评估合规风险并遵守 robots/ToS。
- 请**控制调用频率**（建议两次调用间隔 ≥ 10 秒），不要并发轰击，避免对服务造成压力。
- 页面结构变化可能导致解析失效（结果卡片选择器 `article.result-card`），遇到 0 结果请先手动确认网页可用，欢迎提 issue。
- 相对时间（"1天前"）是页面原始展示，非精确日期。

## License

MIT
