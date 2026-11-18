/**
 * soqq-wechat-search 核心：驱动 so.qq.com（腾讯元宝搜索索引）
 * 的「公众号」tab，抓取微信文章检索结果。
 *
 * 设计要点：
 * - 使用 playwright-core + 系统浏览器（Edge/Chrome），无需下载浏览器内核
 * - 无需登录（tab=weixin_article 公开可访问）
 * - 结果结构：article.result-card（公众号名/相对时间/标题/摘要/真实 mp.weixin.qq.com 链接）
 */
const { chromium } = require('playwright-core');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SEARCH_URL = 'https://so.qq.com/isearch?tab=weixin_article&query=';

/** 从一张 result-card 提取结构化结果 */
function extractCard(card) {
  const links = [...card.querySelectorAll('a[href*="mp.weixin.qq.com"]')];
  if (links.length === 0) return null;
  const href = links[0].href;
  const meta = (links[0].textContent || '').replace(/\s+/g, ' ').trim();
  // meta 形如 "生数科技http://mp.weixin.qq.com1天前"
  const m = meta.match(/^(.*?)https?:\/\/mp\.weixin\.qq\.com(.*)$/);
  const source = m ? m[1].trim() : '';
  const date = m ? m[2].trim() : '';
  const title = links[1]
    ? links[1].textContent.replace(/\s+/g, ' ').trim()
    : (card.querySelector('h2,h3')?.textContent || '').replace(/\s+/g, ' ').trim();
  const snippet = links[2]
    ? links[2].textContent.replace(/\s+/g, ' ').trim().slice(0, 300)
    : '';
  if (!title && !snippet) return null;
  return { title, url: href, source, date, snippet };
}

/** 结果去重：按 url 中的 sn/mid/idx 参数 */
function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    const sn = (r.url.match(/sn=([0-9a-f]+)/) || [])[1] || '';
    const mid = (r.url.match(/mid=(\d+)/) || [])[1] || '';
    const idx = (r.url.match(/idx=(\d+)/) || [])[1] || '';
    const key = `${sn}|${mid}|${idx}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 检索入口
 * @param {object} opts
 * @param {string} opts.query 检索关键词
 * @param {number} [opts.scrolls=2] 额外向下滚动加载次数（每次约 +25 条）
 * @param {number} [opts.timeoutMs=60000]
 * @param {string} [opts.channel] 浏览器通道，默认自动尝试 msedge -> chrome
 * @returns {Promise<{query:string,total:number,results:Array,source:string,fetchedAt:string}>}
 */
async function search({ query, scrolls = 2, timeoutMs = 60000, channel }) {
  if (!query || !query.trim()) throw new Error('query 不能为空');
  const channels = channel ? [channel] : ['msedge', 'chrome', ''];
  let lastErr;
  for (const ch of channels) {
    const launchOpts = { headless: true };
    if (ch) launchOpts.channel = ch;
    let browser;
    try {
      browser = await chromium.launch(launchOpts);
    } catch (e) {
      lastErr = e;
      continue; // 该通道不可用，尝试下一个
    }
    try {
      const page = await browser.newPage({ userAgent: DEFAULT_UA });
      await page.goto(SEARCH_URL + encodeURIComponent(query), {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
      // 等待首屏结果出现（页面可能是 SPA，需要等渲染）
      await page.waitForSelector('article.result-card', { timeout: 30000 });
      // 滚动加载更多
      for (let i = 0; i < scrolls; i++) {
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(2500);
      }
      const raw = await page.evaluate(() =>
        [...document.querySelectorAll('article.result-card')].map((c) => {
          const links = [...c.querySelectorAll('a[href*="mp.weixin.qq.com"]')];
          const meta = (links[0]?.textContent || '').replace(/\s+/g, ' ').trim();
          const m = meta.match(/^(.*?)https?:\/\/mp\.weixin\.qq\.com(.*)$/);
          return {
            url: links[0]?.href || '',
            source: m ? m[1].trim() : '',
            date: m ? m[2].trim() : '',
            title: (links[1]?.textContent || c.querySelector('h2,h3')?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            snippet: (links[2]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300),
          };
        })
      );
      const results = dedupe(raw.filter((r) => r.url && (r.title || r.snippet)));
      return {
        query,
        total: results.length,
        results,
        source: 'so.qq.com (腾讯元宝索引, tab=weixin_article)',
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  }
  throw new Error(
    `无法启动系统浏览器（尝试了 ${channels.join(', ') || '默认 chromium'}）：${lastErr?.message || ''}。请安装 Edge 或 Chrome，或用 PLAYWRIGHT_CHANNEL 指定通道。`
  );
}

module.exports = { search };

// 直接 node src/search.js "关键词" [scrolls] [输出.json] 时作为 CLI 使用
if (require.main === module) {
  const query = process.argv[2];
  const scrolls = parseInt(process.argv[3] || '2', 10);
  const out = process.argv[4];
  if (!query) {
    console.error('用法: node src/search.js "关键词" [scrolls] [输出.json]');
    process.exit(2);
  }
  search({ query, scrolls })
    .then((data) => {
      const json = JSON.stringify(data, null, 2);
      if (out) require('fs').writeFileSync(out, json, 'utf8');
      else console.log(json);
      console.error(`[ok] ${data.total} 条结果${out ? ' -> ' + out : ''}`);
    })
    .catch((e) => {
      console.error('[fail]', e.message);
      process.exit(1);
    });
}
