const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class WeiboCrawler {
    constructor(options = {}) {
        this.visibleMode = options.visibleMode || false;
        this.maxItems = options.maxItems || 200;
        this.noImage = options.noImage || false;
        this.cookiePath = options.cookiePath || path.join(process.cwd(), 'weibo_cookie.json');
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        try {
            this.browser = await puppeteer.launch({
                headless: !this.visibleMode,
                args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
            });
            this.page = await this.browser.newPage();
            
            // 设置默认视窗大小
            await this.page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1
            });

            // 监听视窗大小变化
            this.page.on('resize', async () => {
                const dimensions = await this.page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight
                }));
                await this.page.setViewport({
                    ...dimensions,
                    deviceScaleFactor: 1
                });
            });

            await this.loadCookies();
        } catch (error) {
            console.error('初始化浏览器失败:', error);
            throw error;
        }
    }

    async loadCookies() {
        try {
            const cookies = JSON.parse(fs.readFileSync(this.cookiePath, 'utf8'));
            await this.page.setCookie(...cookies);
        } catch (error) {
            console.error('加载Cookie失败:', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async processTask(task) {
        throw new Error('子类必须实现processTask方法');
    }
}

module.exports = WeiboCrawler;
