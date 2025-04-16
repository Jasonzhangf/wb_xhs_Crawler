const puppeteer = require('puppeteer-core');

class BaseBrowser {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    // 初始化浏览器
    async initialize() {
        // 如果已存在浏览器实例，先关闭它
        if (this.browser) {
            try {
                const pages = await this.browser.pages();
                await Promise.all(pages.map(page => page.close()));
                await this.browser.close();
            } catch (error) {
                console.log('关闭已有浏览器实例时出错:', error.message);
            }
            this.browser = null;
            this.page = null;
        }
        
        this.browser = await puppeteer.launch(this.getBrowserConfig());
        const pages = await this.browser.pages();
        this.page = pages[0];
        await this.page.setViewport({ width: 1400, height: 900 });

        // 设置控制台日志监听
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('浏览器日志:', val)).catch(() => {});
        });
    }

    // 获取浏览器配置，子类需要实现此方法
    getBrowserConfig() {
        throw new Error('getBrowserConfig method must be implemented by child class');
    }

    // 加载Cookie
    async loadCookies(cookies) {
        if (!cookies || cookies.length === 0) {
            throw new Error('Cookie数据为空或格式不正确');
        }

        try {
            // 先访问首页，确保能正确注入cookie
            await this.page.goto(this.getHomePage(), { waitUntil: 'networkidle2', timeout: 60000 });
            await this.wait(5000); // 等待页面加载
            
            console.log(`准备注入${cookies.length}个Cookie...`);
            let successCount = 0;
            for (const cookie of cookies) {
                try {
                    if (!cookie.name || !cookie.value || !cookie.domain) {
                        console.warn(`跳过格式不正确的Cookie: ${JSON.stringify(cookie)}`);
                        continue;
                    }
                    await this.page.setCookie(cookie);
                    successCount++;
                } catch (cookieError) {
                    console.error(`设置Cookie失败: ${cookieError.message}`);
                }
            }
            console.log(`Cookie注入完成: 成功 ${successCount}/${cookies.length} 个`);
            
            // 重新加载页面以应用Cookie
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            await this.wait(2000); // 等待Cookie生效
            
            return await this.checkLoginStatus();
        } catch (error) {
            console.error(`Cookie注入过程中出错: ${error.message}`);
            return false;
        }
    }

    // 获取首页URL，子类需要实现此方法
    getHomePage() {
        throw new Error('getHomePage method must be implemented by child class');
    }

    // 导航到目标页面
    async navigateToPage(url) {
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await this.wait(5000); // 等待页面加载
            return true;
        } catch (error) {
            console.error(`导航失败: ${error.message}`);
            return false;
        }
    }

    // 等待指定时间
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    // 检查登录状态，子类需要实现此方法
    async checkLoginStatus() {
        throw new Error('checkLoginStatus method must be implemented by child class');
    }

    // 关闭浏览器
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = BaseBrowser;