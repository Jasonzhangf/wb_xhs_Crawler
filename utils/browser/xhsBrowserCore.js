const puppeteer = require('puppeteer');
const BaseBrowser = require('./baseBrowser');

class XhsBrowserCore extends BaseBrowser {
    getBrowserConfig() {
        const { BROWSER_CONFIG } = require('../../config/constants');
        return {
            ...BROWSER_CONFIG,
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            timeout: 30000,
            headless: !this.visibleMode
        };
    }

    getHomePage() {
        return 'https://www.xiaohongshu.com';
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