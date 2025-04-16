class BaseScrolling {
    constructor(page) {
        this.page = page;
    }

    // 等待指定时间
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    // 滚动到页面底部
    async scrollToBottom() {
        await this.page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
    }

    // 滚动到页面顶部
    async scrollToTop() {
        await this.page.evaluate(() => {
            window.scrollTo(0, 0);
        });
    }

    // 滚动到指定元素
    async scrollToElement(selector) {
        try {
            const element = await this.page.$(selector);
            if (element) {
                await element.scrollIntoView();
                return true;
            }
            return false;
        } catch (error) {
            console.warn(`滚动到元素 ${selector} 失败`);
            return false;
        }
    }

    // 获取页面高度
    async getPageHeight() {
        return await this.page.evaluate(() => document.body.scrollHeight);
    }

    // 获取当前滚动位置
    async getCurrentScrollPosition() {
        return await this.page.evaluate(() => window.pageYOffset);
    }

    // 滚动页面，子类需要实现此方法
    async scrollPage() {
        throw new Error('scrollPage method must be implemented by child class');
    }

    // 检查是否到达页面底部
    async isAtBottom() {
        return await this.page.evaluate(() => {
            const scrollPosition = window.pageYOffset + window.innerHeight;
            const pageHeight = document.body.scrollHeight;
            return Math.abs(scrollPosition - pageHeight) < 50; // 允许50像素的误差
        });
    }
}

module.exports = BaseScrolling;