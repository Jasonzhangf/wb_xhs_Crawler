const puppeteer = require('puppeteer');
const BaseBrowser = require('./baseBrowser');

class XhsBrowserCore extends BaseBrowser {
    getBrowserConfig() {
        const { BROWSER_CONFIG } = require('../../config/constants');
        return {
            ...BROWSER_CONFIG,
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            timeout: 30000
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
        return await this.page.evaluate((selectors) => {
            const elements = [];
            const processedTexts = new Set();
            
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 &&
                        el.offsetParent !== null && 
                        !el.disabled && 
                        getComputedStyle(el).display !== 'none' &&
                        getComputedStyle(el).visibility !== 'hidden' &&
                        rect.top >= 0 && rect.left >= 0 &&
                        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        rect.right <= (window.innerWidth || document.documentElement.clientWidth)) {
                        const text = el.textContent || el.innerText || '';
                        const trimmedText = text.trim();
                        if (trimmedText && !processedTexts.has(trimmedText)) {
                            processedTexts.add(trimmedText);
                            elements.push({
                                text: trimmedText,
                                selector: selector,
                                y: rect.top + window.scrollY
                            });
                        }
                    }
                });
            });
            return elements;
        }, selectors);
    }
}

module.exports = XhsBrowserCore;