const puppeteer = require('puppeteer-core');
const BaseBrowser = require('./baseBrowser');
const BrowserConfig = require('./browserConfig');
const OCRProcessor = require('../ocrProcessor');

class XhsBrowserCore extends BaseBrowser {
    constructor(options = {}) {
        super();
        this.browser = null;
        this.page = null;
        this.visibleMode = options.visibleMode || false;
        this.ocrProcessor = new OCRProcessor();
    }

    async initialize() {
        // 关闭现有浏览器实例
        if (this.browser) {
            try {
                const pages = await this.browser.pages();
                await Promise.all(pages.map(page => page.close()));
                await this.browser.close();
            } catch (error) {
                console.log('关闭现有浏览器实例时出错:', error.message);
            }
            this.browser = null;
            this.page = null;
        }
        
        // 启动新的浏览器实例
        const config = this.getBrowserConfig();
        this.browser = await puppeteer.launch(config);
        const pages = await this.browser.pages();
        this.page = pages[0];
        await this.page.setViewport({ width: 1400, height: 900 });

        // 设置用户代理
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 设置控制台日志监听
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('浏览器日志:', val)).catch(() => {});
        });

        // 等待确保浏览器就绪
        await this.wait(5000);
    }

    getBrowserConfig() {
        return BrowserConfig.getDefaultConfig({
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            timeout: 30000,
            headless: !this.visibleMode
        });
    }

    getHomePage() {
        return 'https://www.xiaohongshu.com';
    }

    async loadCookies(cookies) {
        try {
            if (!cookies || cookies.length === 0) {
                throw new Error('Cookie数据为空或格式不正确');
            }
            
            console.log('========== 开始注入Cookie ==========');
            
            // 先访问小红书首页
            console.log('正在访问小红书首页...');
            await this.page.goto(this.getHomePage(), { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            console.log('小红书首页加载完成');
            
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

    async verifyPageContent() {
        try {
            console.log('正在验证页面内容...');
            // 等待页面主要内容加载
            await this.page.waitForFunction(() => {
                // 检查页面是否包含主要内容容器
                const mainContent = document.querySelector('.note-item, .search-result-container');
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

    async checkLoginStatus() {
        try {
            // 检查是否存在登录状态的标识元素
            const isLoggedIn = await this.page.evaluate(() => {
                // 检查是否存在"我"的链接元素
                const meElement = document.querySelector('a[href*="/user/profile"] .channel');
                if (meElement && meElement.textContent.trim() === '我') {
                    return true;
                }
                return false;
            });


            console.log(`登录状态检查: ${isLoggedIn ? '已登录' : '未登录'}`);
            return isLoggedIn;
        } catch (error) {
            console.error('检查登录状态时出错:', error);
            return false;
        }
    }

    async navigateToSearchPage(keyword) {
        try {
            // 等待页面加载完成
            await this.page.waitForSelector('.search-input', { timeout: 15000 });
            
            // 等待一段时间确保页面完全加载
            await this.wait(2000);
            
            // 点击搜索框并输入关键词
            const searchInput = await this.page.$('.search-input');
            if (!searchInput) {
                throw new Error('未找到搜索输入框');
            }
            
            await searchInput.click();
            await this.page.type('.search-input', keyword);
            
            // 按回车键搜索
            await this.page.keyboard.press('Enter');
            
            // 等待搜索结果加载
            await this.page.waitForSelector('.note-item', { timeout: 15000 });
            
            // 额外等待确保结果完全加载
            await this.wait(2000);
            
            console.log(`已导航到搜索页面，关键词: ${keyword}`);
            return true;
        } catch (error) {
            console.error('导航到搜索页面时出错:', error);
            throw error;
        }
    }

    async getVisibleElements(selectors) {
        console.log(`开始查找可见元素，选择器: ${selectors.join(', ')}`);
        const elements = await this.page.evaluate((selectors) => {
            const elements = [];
            const processedTexts = new Set();
            
            selectors.forEach(selector => {
                console.log(`正在处理选择器: ${selector}`);
                const foundElements = document.querySelectorAll(selector);
                console.log(`找到 ${foundElements.length} 个元素`);
                
                foundElements.forEach((el, index) => {
                    const rect = el.getBoundingClientRect();
                    const text = el.textContent || el.innerText || '';
                    const trimmedText = text.trim();
                    
                    console.log(`检查元素 ${index + 1}/${foundElements.length}:`);
                    console.log(`- 文本内容: ${trimmedText}`);
                    console.log(`- 位置: (${rect.left}, ${rect.top}) - (${rect.right}, ${rect.bottom})`);
                    console.log(`- 尺寸: ${rect.width}x${rect.height}`);
                    
                    const isVisible = rect.width > 0 && rect.height > 0 &&
                        el.offsetParent !== null && 
                        !el.disabled && 
                        getComputedStyle(el).display !== 'none' &&
                        getComputedStyle(el).visibility !== 'hidden' &&
                        rect.top >= 0 && rect.left >= 0 &&
                        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        rect.right <= (window.innerWidth || document.documentElement.clientWidth);
                    
                    console.log(`- 可见性检查: ${isVisible ? '通过' : '未通过'}`);
                    
                    if (isVisible && trimmedText && !processedTexts.has(trimmedText)) {
                        processedTexts.add(trimmedText);
                        elements.push({
                            text: trimmedText,
                            selector: selector,
                            y: rect.top + window.scrollY,
                            dimensions: {
                                width: rect.width,
                                height: rect.height,
                                left: rect.left,
                                top: rect.top
                            }
                        });
                        console.log(`✓ 元素已添加到结果集`);
                    }
                });
            });
            return elements;
        }, selectors);
        
        console.log(`找到 ${elements.length} 个可见元素`);
        elements.forEach((el, index) => {
            console.log(`可见元素 ${index + 1}:`);
            console.log(`- 选择器: ${el.selector}`);
            console.log(`- 文本: ${el.text}`);
            console.log(`- 位置: (${el.dimensions.left}, ${el.dimensions.top})`);
            console.log(`- 尺寸: ${el.dimensions.width}x${el.dimensions.height}`);
        });
        
        return elements;
    }
}

module.exports = XhsBrowserCore;