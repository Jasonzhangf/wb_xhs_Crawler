class BaseContentCapture {
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

    // 获取元素文本
    async getElementText(selector) {
        try {
            await this.waitForSelector(selector);
            return await this.page.$eval(selector, el => el.textContent.trim());
        } catch (error) {
            console.warn(`获取元素 ${selector} 文本失败`);
            return '';
        }
    }

    // 获取元素属性
    async getElementAttribute(selector, attribute) {
        try {
            await this.waitForSelector(selector);
            return await this.page.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
        } catch (error) {
            console.warn(`获取元素 ${selector} 属性 ${attribute} 失败`);
            return null;
        }
    }

    // 检查元素是否存在
    async elementExists(selector) {
        try {
            return await this.page.$(selector) !== null;
        } catch (error) {
            return false;
        }
    }

    // 获取多个元素
    async getElements(selector) {
        try {
            await this.waitForSelector(selector);
            return await this.page.$$(selector);
        } catch (error) {
            console.warn(`获取元素集合 ${selector} 失败`);
            return [];
        }
    }

    // 获取内容，子类需要实现此方法
    async getContent() {
        throw new Error('getContent method must be implemented by child class');
    }

    // 处理图片，子类需要实现此方法
    async processImages() {
        throw new Error('processImages method must be implemented by child class');
    }

    // 处理文本，子类需要实现此方法
    async processText() {
        throw new Error('processText method must be implemented by child class');
    }
}

module.exports = BaseContentCapture;