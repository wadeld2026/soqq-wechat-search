/**
 * soqq-wechat-search MCP Server (stdio)
 *
 * 在任何支持 MCP 的宿主（WorkBuddy / Claude Desktop / Cursor / Cherry Studio /
 * 扣子 Coze 等）中注册后，提供工具：
 *   soqq_wechat_search { query: string, scrolls?: number }
 *   -> 返回腾讯元宝索引的微信公众号文章检索结果（真实链接/公众号/相对时间/摘要）
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { search } = require('./search');

const server = new McpServer({
  name: 'soqq-wechat-search',
  version: '1.0.0',
});

server.registerTool(
  'soqq_wechat_search',
  {
    title: '微信公众号文章搜索',
    description:
      '通过腾讯搜索(so.qq.com, 元宝索引)检索微信公众号文章。返回标题、真实 mp.weixin.qq.com 链接、公众号名称、相对发布时间和摘要。无需微信登录。每次约 25 条 × scrolls 轮滚动加载。适合枚举某个公众号的历史文章、追踪话题相关文章。',
    inputSchema: {
      query: z.string().describe('检索关键词，如 "Motubrain 开源" 或 "生数科技 训练报告"'),
      scrolls: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .describe('额外滚动加载次数，每轮约多拿 25 条，默认 2'),
    },
  },
  async ({ query, scrolls }) => {
    try {
      const data = await search({ query, scrolls: scrolls ?? 2 });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `检索失败: ${e.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
  // MCP stdio 模式下不要往 stdout 打日志，stderr 用于诊断
  console.error('[soqq-wechat-search] MCP server started (stdio)');
}

main().catch((e) => {
  console.error('[soqq-wechat-search] fatal:', e.message);
  process.exit(1);
});
