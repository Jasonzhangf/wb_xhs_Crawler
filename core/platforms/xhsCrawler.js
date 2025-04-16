const path = require('path');
const fs = require('fs');
const BrowserManager = require('../../utils/browser/browserManager');
const XhsBrowserCore = require('../../utils/browser/xhsBrowserCore');
const BaseContentCapture = require('../../utils/browser/baseContentCapture');
const BaseInteraction = require('../../utils/browser/baseInteraction');
const BaseScrolling = require('../../utils/browser/baseScrolling');

class XhsCrawler {
    constructor(options = {}) {
        this.browser = new BrowserManager();
        this.browser.core = new XhsBrowserCore();
        this.browser.contentCapture = new BaseContentCapture();
        this.browser.interaction = new BaseInteraction();
        this.browser.scrolling = new BaseScrolling();
        this.visibleMode = options.visibleMode || false;
        this.visitedUrls = new Set();
    }

    async initialize() {
        await this.browser.initialize(this.visibleMode);
        // 如果存在cookie文件，加载cookie
        const cookiePath = path.join(process.cwd(), 'xiaohongshu_cookie.json');
        if (fs.existsSync(cookiePath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
            await this.browser.loadCookies(cookies);
        }
    }

    async processTask(task) {
        if (task.type !== 'xhs_keyword') {
            console.log(`不支持的任务类型: ${task.type}`);
            return;
        }

        const taskDir = path.join('data', 'xhs', task.keyword);
        this.ensureDir(taskDir);

        try {
            await this.browser.core.navigateToSearchPage(task.keyword);
            let processedCount = 0;
            const maxItems = task.max_items || 10;

            while (processedCount < maxItems) {

                const elements = await this.browser.core.getVisibleElements([
                    '[data-v-a264b01a].title',
                    '.note-item'
                ]);

                for (const element of elements) {
                    if (processedCount >= maxItems) break;

                    try {
                        const success = await this.browser.interaction.clickElement(element);
                        if (!success) continue;

                        await this.browser.wait(2000); // 等待内容加载
                        const title = await this.browser.contentCapture.getElementText('.title');
                        const text = await this.browser.contentCapture.getElementText('.content');
                        const content = { title, text };

                        if (!content.title && !content.text) continue;

                        const noteDir = this.createNoteDirectory(taskDir, processedCount + 1);
                        await this.processNoteContent(noteDir, content, !task.noimage);

                        processedCount++;
                        console.log(`已处理 ${processedCount}/${maxItems} 条笔记`);

                        await this.browser.page.keyboard.press('Escape');
                        await this.browser.interaction.wait(2000);
                    } catch (error) {
                        console.error(`处理笔记时出错: ${error.message}`);
                        continue;
                    }
                }
                await this.browser.autoScroll();
            }
        } catch (error) {
            console.error('处理任务时出错:', error);
        }
    }

    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    createNoteDirectory(taskDir, noteIndex) {
        const noteDir = path.join(taskDir, noteIndex.toString());
        this.ensureDir(noteDir);
        return noteDir;
    }

    async processNoteContent(noteDir, content, downloadImages = true) {
        // 保存文本内容
        fs.writeFileSync(
            path.join(noteDir, 'content.json'),
            JSON.stringify(content, null, 2)
        );

        // 下载图片
        if (downloadImages) {
            const images = await this.browser.contentCapture.page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('div.media-container img'));
                return imgs.map(img => img.src).filter(src => src.startsWith('http'));
            });
            for (let i = 0; i < images.length; i++) {
                try {
                    const response = await fetch(images[i]);
                    const buffer = await response.buffer();
                    fs.writeFileSync(
                        path.join(noteDir, `image_${i + 1}.jpg`),
                        buffer
                    );
                } catch (error) {
                    console.error(`下载图片失败: ${error.message}`);
                }
            }
        }

        // 生成Markdown文件
        let markdown = `# ${content.title}\n\n${content.text}\n`;
        if (content.comments && content.comments.length > 0) {
            markdown += '\n## 评论\n\n';
            content.comments.forEach((comment, index) => {
                markdown += `${index + 1}. ${comment}\n`;
            });
        }

        fs.writeFileSync(
            path.join(noteDir, 'content.md'),
            markdown
        );
    }
}

module.exports = XhsCrawler;