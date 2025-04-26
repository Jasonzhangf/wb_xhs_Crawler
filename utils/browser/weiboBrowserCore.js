const puppeteer = require('puppeteer');
const WeiboUserCapture = require('./weiboUserCapture');
const OCRProcessor = require('../ocrProcessor');
const WeiboFileSystem = require('../weiboFileSystem');

class WeiboBrowserCore {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.userCapture = null;
        this.fileSystem = WeiboFileSystem;
        this.browserConfig = options.browserConfig || {
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized']
        };
    }

    // Initialize browser
    async initialize() {
        // Close existing browser instance if any
        if (this.browser) {
            try {
                const pages = await this.browser.pages();
                await Promise.all(pages.map(page => page.close()));
                await this.browser.close();
            } catch (error) {
                console.log('Error closing existing browser instance:', error.message);
            }
            this.browser = null;
            this.page = null;
        }
        
        this.browser = await puppeteer.launch(this.browserConfig);
        const pages = await this.browser.pages();
        this.page = pages[0];
        await this.page.setViewport({ width: 1400, height: 900 });

        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        this.userCapture = new WeiboUserCapture(this.page, this.fileSystem);

        // Set console log listener
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('Browser log:', val)).catch(() => {});
        });

        // Wait to ensure browser is ready
        await this.wait(5000);
    }

    // 等待页面稳定
    async waitForPageStable() {
        await this.wait(5000);
        return true;
    }

    // 加载Cookie
    async loadCookies(cookies) {
        try {
            if (!cookies || cookies.length === 0) {
                throw new Error('Cookie数据为空或格式不正确');
            }
            
            console.log('========== 开始注入Cookie ==========');
            
            // 先访问微博首页
            console.log('正在访问微博首页...');
            await this.page.goto('https://weibo.com', { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            console.log('微博首页加载完成');
            
            // 注入Cookie前先清除现有Cookie
            const client = await this.page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            console.log('已清除现有Cookie');
            
            console.log(`准备注入${cookies.length}个Cookie...`);
            let successCount = 0;
            for (const cookie of cookies) {
                try {
                    // 检查cookie格式
                    if (!cookie.name || !cookie.value || !cookie.domain) {
                        console.warn(`跳过格式不正确的Cookie: ${JSON.stringify(cookie)}`);
                        continue;
                    }
                    await this.page.setCookie(cookie);
                    successCount++;
                    if (successCount % 5 === 0 || successCount === cookies.length) {
                        console.log(`已注入 ${successCount}/${cookies.length} 个Cookie`);
                    }
                } catch (cookieError) {
                    console.error(`设置Cookie失败: ${cookieError.message}`);
                }
            }
            console.log(`Cookie注入完成: 成功 ${successCount}/${cookies.length} 个`);
            
            // 重新加载页面以应用Cookie
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            await this.wait(2000); // 等待Cookie生效
            
            return true;

        } catch (error) {
            console.error(`Cookie注入过程中出错: ${error.message}`);
            throw error;
        }
    }

    // 验证页面内容是否正确加载
    async verifyPageContent() {
        try {
            console.log('正在验证页面内容...');
            // 等待页面主要内容加载
            await this.page.waitForFunction(() => {
                // 检查页面是否包含主要内容容器
                const mainContent = document.querySelector('.Feed_body_3R4DL, .Main_full_1dfQX, .woo-box-flex, .Feed_body_3R0rO');
                if (!mainContent) return false;
                
                // 检查是否有实际内容
                const hasContent = mainContent.children.length > 0;
                
                return hasContent;
            }, { timeout: 10000 }).catch(() => false);

            // 验证页面标题
            const title = await this.page.title();
            if (title.includes('404')) {
                throw new Error(`页面不存在: ${title}`);
            }

            return true;
        } catch (error) {
            console.error('页面内容验证失败:', error.message);
            return false;
        }
    }

    // 导航到目标页面
    async navigateToPage(url) {
        console.log(`正在导航到: ${url}`);
        let retryCount = 0;
        const maxRetries = 3;

        try {
            if (typeof url !== 'string') {
                console.error('URL is not a string:', url);
                throw new Error('URL is not a string');
            }

            if (!url.startsWith('http')) {
                console.error('URL is not a valid HTTP URL:', url);
                throw new Error('URL is not a valid HTTP URL');
            }

            while (retryCount < maxRetries) {
                try {
                    // 监听请求失败事件
                    this.page.on('requestfailed', request => {
                        console.error(`Request failed: ${request.url()} ${request.failure().errorText}`);
                    });

                    // 访问目标链接
                    console.log(`正在导航到目标链接: ${url} (尝试 ${retryCount + 1}/${maxRetries})`);
                    const response = await this.page.goto(url, { 
                        waitUntil: 'networkidle2', 
                        timeout: 60000, 
                        maxRedirects: 20 
                    });
                    
                    if (!response) {
                        throw new Error('页面加载失败，未收到响应');
                    }
                    
                    if (!response.ok()) {
                        throw new Error(`HTTP错误: ${response.status()} ${response.statusText()}`);
                    }

                    // 等待页面加载完成
                    await this.wait(3000);
                    console.log('页面加载完成，等待内容显示...');

                    // 验证页面内容
                    const contentVerified = await this.verifyPageContent();
                    if (!contentVerified) {
                        throw new Error('页面内容验证失败');
                    }

                    console.log('页面导航成功，内容已正确加载');
                    return true;

                } catch (error) {
                    console.error(`导航尝试 ${retryCount + 1} 失败: ${error.message}`);
                    this.page.removeAllListeners('requestfailed');
                    
                    if (retryCount < maxRetries - 1) {
                        retryCount++;
                        console.log(`等待5秒后进行第 ${retryCount + 1} 次重试...`);
                        await this.wait(5000);
                        continue;
                    } else {
                        throw error;
                    }
                }
            }

            throw new Error(`导航失败，已重试${maxRetries}次`);

        } catch (error) {
            console.error(`导航最终失败: ${error.message}`);
            throw error;
        } finally {
            this.page.removeAllListeners('requestfailed');
        }
    }

    // 等待指定时间
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    // 检查登录状态
    async checkLoginStatus() {
        try {
            console.log('正在检查登录状态...');
            // 尝试检测登录状态的元素
            const loginStatusElement = await this.page.evaluate(() => {
                // 检查多个可能表示登录状态的元素
                const selectors = [
                    '.gn_nav_list .gn_person',  // 用户头像
                    '.gn_nav_list .S_txt1',    // 用户名
                    '.woo-avatar',              // 新版头像
                    '.Frame_top_1abeN',        // 新版顶部栏
                    '.woo-box-item-inlineBlock' // 新版用户信息
                ];
                
                // 检查每个选择器
                const results = {};
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    results[selector] = !!element;
                }
                
                // 检查是否有登录弹窗
                const hasLoginPopup = document.querySelector('.woo-modal-main') !== null;
                results['hasLoginPopup'] = hasLoginPopup;
                
                // 判断登录状态
                const isLoggedIn = Object.values(results).some(result => result === true) && !hasLoginPopup;
                
                // 在浏览器控制台输出详细信息
                console.log('登录状态检查结果:', JSON.stringify(results));
                
                return isLoggedIn;
            });
            
            console.log(`登录状态检查结果: ${loginStatusElement ? '已登录' : '未登录'}`);
            return loginStatusElement;
        } catch (error) {
            console.error(`检查登录状态时出错: ${error.message}`);
            return false;
        }
    }

    // 关闭浏览器
    async close() {
        if (this.browser) {
            try {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            } catch (error) {
                console.error('关闭浏览器时出错:', error.message);
            }
        }
    }
}

module.exports = WeiboBrowserCore;