const puppeteer = require('puppeteer-core');
const { BROWSER_CONFIG, SELECTORS, WAIT_TIMES } = require('../config/constants');

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize(visible = false) {
        const config = {
            ...BROWSER_CONFIG,
            headless: !visible,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || BROWSER_CONFIG.executablePath
        };

        this.browser = await puppeteer.launch(config);
        const pages = await this.browser.pages();
        this.page = pages[0];
        await this.page.setViewport({ width: 1400, height: 900 });

        // 设置控制台日志监听
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('浏览器日志:', val)).catch(() => {});
        });
    }

    async loadCookies(cookies) {
        await this.page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle2' });
        for (const cookie of cookies) {
            await this.page.setCookie(cookie);
        }
        await this.page.reload({ waitUntil: 'networkidle2' });
    }

    async navigateToSearchPage(keyword) {
        try {
            console.log(`正在导航到搜索页面，关键词: ${keyword}`);
            const encodedKeyword = encodeURIComponent(keyword);
            const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodedKeyword}&source=web&type=51`;
            
            console.log(`开始加载页面: ${searchUrl}`);
            const response = await this.page.goto(searchUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            if (!response || !response.ok()) {
                throw new Error(`页面加载失败: ${response ? response.status() : '无响应'}`);
            }
            
            console.log('页面加载完成，等待页面稳定...');
            await this.randomWait();
            
            // 验证页面是否正确加载
            const pageLoaded = await this.page.evaluate(() => {
                return document.querySelector('.search-result-container') !== null;
            });
            
            if (!pageLoaded) {
                throw new Error('搜索结果容器未找到，页面可能未正确加载');
            }
            
            console.log('导航完成，页面已就绪');
        } catch (error) {
            console.error(`导航到搜索页面失败: ${error.message}`);
            console.error('详细错误信息:', error);
            throw error;
        }
    }

    async autoScroll(maxScrolls = 10) {
        let lastHeight = 0;
        let scrollCount = 0;
        
        while (scrollCount < maxScrolls) {
            const currentHeight = await this.page.evaluate(() => document.documentElement.scrollHeight);
            if (currentHeight === lastHeight) {
                console.log('页面高度未变化，停止滚动');
                break;
            }
            
            await this.page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
            await this.randomWait(2); // 增加等待时间
            
            lastHeight = currentHeight;
            scrollCount++;
            console.log(`第 ${scrollCount} 次滚动完成`);
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

    async findAndClickElement(element, maxRetries = 3) {
        console.log(`尝试点击元素: ${element.text}`);
        const selector = SELECTORS.dataV.join(', ');
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                await this.page.waitForSelector(selector, { visible: true, timeout: 5000 });
                const elements = await this.page.$$(selector);
                
                for (const el of elements) {
                    const text = await this.page.evaluate(el => el.textContent || '', el);
                    if (text && text.indexOf(element.text) !== -1) {
                        const isVisible = await this.page.evaluate(el => {
                            const rect = el.getBoundingClientRect();
                            return rect.width > 0 && 
                                   rect.height > 0 && 
                                   window.getComputedStyle(el).visibility !== 'hidden' &&
                                   window.getComputedStyle(el).display !== 'none' &&
                                   !el.disabled;
                        }, el);
                        
                        if (isVisible) {
                            await this.page.evaluate(el => {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, el);
                            await this.randomWait();
                            await el.click();
                            await this.randomWait(3); // 增加点击后的等待时间到3秒
                            
                            // 验证页面是否成功加载
                            const contentLoaded = await this.page.evaluate(() => {
                                const content = document.querySelector('.content');
                                return content !== null;
                            });
                            
                            if (contentLoaded) {
                                return true;
                            }
                        }
                    }
                }
                
                // 如果没有找到匹配的元素，等待3秒后重试
                await this.randomWait(3);
                retryCount++;
                console.log(`点击失败，第 ${retryCount} 次重试...`);
                
                if (retryCount === maxRetries) {
                    // 最后一次重试时，刷新页面
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    await this.randomWait(2);
                }
            } catch (error) {
                console.error(`点击元素失败: ${error.message}`);
                if (error.message.includes('frame detached')) {
                    // frame detach错误时重置计数
                    retryCount = 0;
                    await this.page.reload({ waitUntil: 'networkidle2' });
                    await this.randomWait(2);
                } else {
                    retryCount++;
                }
            }
        }
        return false;
    }

    async getPageContent() {
        return await this.page.evaluate(() => {
            const metaDesc = document.querySelector('meta[name="description"]');
            const content = metaDesc ? metaDesc.getAttribute('content') : '';
            const noteContent = document.querySelector('.content')
                ? document.querySelector('.content').innerText
                : '';
            return { metaContent: content, noteContent: noteContent };
        });
    }

    async getPostImages() {
        return await this.page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('div.media-container img'));
            return imgs.map(img => img.src).filter(src => src.startsWith('http'));
        });
    }

    async randomWait(multiplier = 1) {
        const waitTime = Math.floor(Math.random() * 
            (WAIT_TIMES.max - WAIT_TIMES.min) + WAIT_TIMES.min) * multiplier;
        console.log(`等待 ${waitTime/1000} 秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = new BrowserManager();