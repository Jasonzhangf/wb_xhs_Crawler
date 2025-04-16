/**
 * 浏览器管理类 - 统一入口
 * 整合所有基础功能模块，提供统一的接口
 */
const BaseBrowser = require('./baseBrowser');
const BaseContentCapture = require('./baseContentCapture');
const BaseInteraction = require('./baseInteraction');
const BaseScrolling = require('./baseScrolling');

class BrowserManager {
    constructor() {
        this.core = null;
        this.contentCapture = null;
        this.interaction = null;
        this.scrolling = null;
    }

    get page() {
        return this.core ? this.core.page : null;
    }

    // 初始化浏览器
    async initialize() {
        if (!this.core) {
            throw new Error('Browser core must be set before initialization');
        }
        await this.core.initialize();
        
        // 初始化各个功能模块
        if (!this.contentCapture || !this.interaction || !this.scrolling) {
            throw new Error('All browser components must be set before initialization');
        }
    }

    // 加载Cookie
    async loadCookies(cookies) {
        if (!this.core) {
            throw new Error('Browser core not initialized');
        }
        return await this.core.loadCookies(cookies);
    }

    // 导航到目标页面
    async navigateToPage(url) {
        if (!this.core) {
            throw new Error('Browser core not initialized');
        }
        return await this.core.navigateToPage(url);
    }

    // 点击展开按钮
    async clickExpandButtons() {
        if (!this.interaction) {
            throw new Error('Interaction module not initialized');
        }
        return await this.interaction.clickExpandButtons();
    }

    // 获取内容
    async getContent() {
        if (!this.contentCapture) {
            throw new Error('Content capture module not initialized');
        }
        return await this.contentCapture.getContent();
    }

    // 滚动页面
    async scrollPage() {
        if (!this.scrolling) {
            throw new Error('Scrolling module not initialized');
        }
        return await this.scrolling.scrollPage();
    }

    // 点击下一页
    async clickNextPage(hasContent = false) {
        if (!this.interaction) {
            throw new Error('Interaction module not initialized');
        }
        return await this.interaction.clickNextPage(hasContent);
    }

    // 等待指定时间
    async wait(ms) {
        if (!this.core) {
            throw new Error('Browser core not initialized');
        }
        await this.core.wait(ms);
    }

    // 随机等待一段时间
    async randomWait(multiplier = 1, minTime = 1000, maxTime = 3000) {
        const waitTime = Math.floor(Math.random() * (maxTime - minTime) + minTime) * multiplier;
        console.log(`等待 ${waitTime/1000} 秒...`);
        await this.wait(waitTime);
    }

    // 关闭浏览器
    async close() {
        if (this.core) {
            await this.core.close();
            this.core = null;
            this.contentCapture = null;
            this.interaction = null;
            this.scrolling = null;
        }
    }
}

module.exports = BrowserManager;