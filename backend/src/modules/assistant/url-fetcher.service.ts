import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * 用户提交URL → 抓取原文 → 简单清洗
 * 不做字段抽取，只把 HTML 转成可读文本，喂给 LlmAssistantService
 */
@Injectable()
export class UrlFetcherService {
  private readonly logger = new Logger(UrlFetcherService.name);

  async fetch(url: string): Promise<{ title: string; content: string } | null> {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const buffer = Buffer.from(response.data);
      const html = this.decode(buffer);
      const title = this.extractTitle(html);
      const content = this.htmlToText(html);

      if (content.length < 100) {
        this.logger.warn(`URL 抓到内容过短 (${content.length} chars): ${url}`);
      }

      return { title, content };
    } catch (error: any) {
      this.logger.error(`URL 抓取失败 ${url}: ${error.message}`);
      return null;
    }
  }

  private decode(buffer: Buffer): string {
    // 优先尝试 UTF-8，失败再尝试 GBK（中国大陆网站常见）
    try {
      const utf8 = buffer.toString('utf-8');
      // 简单乱码检测：如果替换字符过多，认为是非 UTF-8
      const badRatio = (utf8.match(/�/g) || []).length / utf8.length;
      if (badRatio > 0.01) {
        // 用 iconv-lite 或 Buffer 转码
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const iconv = require('iconv-lite');
          return iconv.decode(buffer, 'gbk');
        } catch {
          // 没装 iconv-lite，退回 utf-8
        }
      }
      return utf8;
    } catch {
      return buffer.toString('latin1');
    }
  }

  private extractTitle(html: string): string {
    // 优先 <h1>, 其次 <title>
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) return this.stripTags(h1[1]).slice(0, 200);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title) return this.stripTags(title[1]).slice(0, 200);
    return '';
  }

  private htmlToText(html: string): string {
    // 移除 script/style
    let txt = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    txt = txt.replace(/<style[\s\S]*?<\/style>/gi, '');
    // 移除 head 部分（meta, link 等）
    txt = txt.replace(/<head[\s\S]*?<\/head>/gi, '');
    // 段落级标签换行
    txt = txt.replace(/<(br|p|div|tr|li|h\d|td|article)[^>]*>/gi, '\n');
    txt = txt.replace(/<\/(p|div|tr|li|h\d|td|article)>/gi, '\n');
    // 移除剩余标签
    txt = this.stripTags(txt);
    // 解码常见 HTML 实体
    txt = txt
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    // 压缩空白
    txt = txt.replace(/[ \t]+/g, ' ');
    txt = txt.replace(/\n[ \t]+/g, '\n');
    txt = txt.replace(/\n{3,}/g, '\n\n');
    return txt.trim();
  }

  private stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '').trim();
  }
}
