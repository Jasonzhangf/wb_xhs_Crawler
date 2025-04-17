const BaseScrolling = require('./baseScrolling');

class XhsScrolling extends BaseScrolling {
    constructor(page) {
        super(page);
    }

    // 实现小红书特定的滚动逻辑
    async scrollPage() {
        console.log('开始在小红书页面滚动...');
        try {
            // 小红书的滚动通常是滚动整个窗口
            await this.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 0.8); // 每次滚动80%的视窗高度
            });
            await this.wait(1000); // 等待加载
            console.log('小红书页面滚动完成');
            return { reachedBottom: await this.isAtBottom() }; // 返回是否到底
        } catch (error) {
            console.error('小红书页面滚动失败:', error);
            throw error; // 重新抛出错误，以便上层捕获
        }
    }

    // 可以根据需要添加更多小红书特定的滚动方法
}

module.exports = XhsScrolling;