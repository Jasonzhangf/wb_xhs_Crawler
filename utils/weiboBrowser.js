/**
 * 微博浏览器模块 - 主入口
 * 整合了所有拆分的功能模块，保持与原有API的兼容性
 */
const WeiboBrowserCore = require('./browser/weiboBrowserCore');
const WeiboContentCapture = require('./browser/weiboContentCapture');
const WeiboInteraction = require('./browser/weiboInteraction');
const WeiboScrolling = require('./browser/weiboScrolling');

class WeiboBrowser {
    constructor() {
        this.core = new WeiboBrowserCore();
        this.contentCapture = null;
        this.interaction = null;
        this.scrolling = null;
    }

    get page() {
        return this.core.page;
    }
    
    // 添加setter方法，解决"Cannot set property page of #<WeiboBrowser> which has only a getter"
    set page(value) {
        // This setter is intentionally left empty as page should be managed by core
    }

    // 初始化浏览器
    async initialize() {
        await this.core.initialize();
        
        // 初始化各个功能模块
        this.contentCapture = new WeiboContentCapture(this.page);
        this.interaction = new WeiboInteraction(this.page);
        this.scrolling = new WeiboScrolling(this.page);
    }

    // 加载Cookie
    async loadCookies(cookies) {
        await this.core.loadCookies(cookies);
    }

    // 导航到目标页面
    async navigateToPage(url) {
        // 检查是否为手动模式
        const weiboConfig = require('./weiboConfig');
        if (weiboConfig.MANUAL_MODE) {
            console.log('\n处于手动模式，请在浏览器中进行必要的操作，完成后按回车键继续...');
            // 等待用户按回车键
            await new Promise(resolve => {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                readline.question('', () => {
                    readline.close();
                    resolve();
                });
            });
            console.log('继续执行任务...');
        }
        await this.core.navigateToPage(url);
    }

    // 点击展开按钮
    async clickExpandButtons() {
        await this.interaction.clickExpandButtons();
    }

    // 获取微博内容
    async getWeiboContent() {
        // 不再基于NO_IMAGE参数决定是否执行操作
        const weiboConfig = require('./weiboConfig');
        console.log(`当前noimage参数值: ${weiboConfig.NO_IMAGE}`); // 保留日志以便调试
        // 传递配置但不再使用NO_IMAGE控制行为
        this.contentCapture.page.evaluateOnNewDocument(weiboConfig => {
            window.__WEIBO_CONFIG = weiboConfig;
        }, {NO_IMAGE: weiboConfig.NO_IMAGE});
        return await this.contentCapture.getWeiboContent();
    }

    // 滚动页面
    async scrollPage() {
        return await this.scrolling.scrollPage();
    }

    // 点击下一页
    async clickNextPage(hasContent = false) {
        return await this.interaction.clickNextPage(hasContent);
    }

    // 等待指定时间
    async wait(ms) {
        await this.core.wait(ms);
    }

    // 随机等待一段时间
    async randomWait(multiplier = 1) {
        const { min, max } = require('./weiboConfig').WAIT_TIMES;
        
        // 计算随机等待时间
        const waitTime = Math.floor(Math.random() * (max - min) + min) * multiplier;
        console.log(`等待 ${waitTime/1000} 秒...`);
        await this.wait(waitTime);
    }

    // 关闭浏览器
    async close() {
        if (this.core && this.core.browser) {
            await this.core.browser.close();
            this.core.browser = null;
            this.core.page = null;
            // 不直接设置this.page = null，因为它只有getter方法
            this.contentCapture = null;
            this.interaction = null;
            this.scrolling = null;
        }
    }
}

module.exports = new WeiboBrowser();