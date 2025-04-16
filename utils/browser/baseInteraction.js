class BaseInteraction {
    constructor(page) {
        this.page = page;
    }

    // 等待指定时间
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    // 等待元素加载
    async waitForSelector(selector, timeout = 10000) {
        try {
            await this.page.waitForSelector(selector, { timeout });
            return true;
        } catch (error) {
            console.warn(`等待元素 ${selector} 超时`);
            return false;
        }
    }

    // 点击元素
    async clickElement(selector) {
        try {
            await this.waitForSelector(selector);
            await this.page.click(selector);
            return true;
        } catch (error) {
            console.warn(`点击元素 ${selector} 失败`);
            return false;
        }
    }

    // 输入文本
    async typeText(selector, text) {
        try {
            await this.waitForSelector(selector);
            await this.page.type(selector, text);
            return true;
        } catch (error) {
            console.warn(`输入文本到元素 ${selector} 失败`);
            return false;
        }
    }

    // 获取元素是否可见
    async isElementVisible(selector) {
        try {
            await this.waitForSelector(selector);
            return await this.page.evaluate(selector => {
                const element = document.querySelector(selector);
                if (!element) return false;
                const style = window.getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }, selector);
        } catch (error) {
            return false;
        }
    }

    // 等待元素消失
    async waitForElementToDisappear(selector, timeout = 10000) {
        try {
            await this.page.waitForSelector(selector, { hidden: true, timeout });
            return true;
        } catch (error) {
            console.warn(`等待元素 ${selector} 消失超时`);
            return false;
        }
    }

    // 点击展开按钮，子类需要实现此方法
    async clickExpandButtons() {
        throw new Error('clickExpandButtons method must be implemented by child class');
    }

    // 点击下一页，子类需要实现此方法
    async clickNextPage() {
        throw new Error('clickNextPage method must be implemented by child class');
    }
}

module.exports = BaseInteraction;