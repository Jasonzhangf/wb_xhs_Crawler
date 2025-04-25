const puppeteer = require('puppeteer-core');
const weiboConfig = require('../weiboConfig');
const WeiboUserCapture = require('./weiboUserCapture');
const OCRProcessor = require('../ocrProcessor');
const WeiboFileSystem = require('../weiboFileSystem');

class WeiboBrowserCore {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userCapture = null;
        this.fileSystem = WeiboFileSystem;
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
        
        this.browser = await puppeteer.launch(weiboConfig.BROWSER_CONFIG);
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
    async captureUserPosts(maxItems, noimage = false) {
        try {
            // Get username from profile header
            const username = await this.userCapture.captureUsername();
            if (!username) {
                throw new Error('Failed to capture username');
            }

            // Create task folder
            const taskFolder = this.fileSystem.createTaskFolder(username, maxItems);
            console.log(`Created task folder: ${taskFolder}`);

            // Capture posts
            const capturedCount = await this.userCapture.captureUserPosts(maxItems, taskFolder, noimage);
            console.log(`Captured ${capturedCount} posts`);

            // Merge JSON files and create export if needed
            await this.fileSystem.mergeJsonFiles(taskFolder);

            return capturedCount;
        } catch (error) {
            console.error('Error in captureUserPosts:', error);
            throw error;
        }
    }

    async loadCookies(cookies) {
        try {
            if (!cookies || cookies.length === 0) {
                throw new Error('Cookie数据为空或格式不正确');
            }
            
            console.log('========== 开始注入Cookie ==========');
            console.log(`准备注入${cookies.length}个Cookie...`);
            let successCount = 0;
            for (const cookie of cookies) {
                try {
                    // 检查cookie格式
                    if (!cookie.name || !cookie.value || !cookie.domain) {
                        console.warn(`跳过格式不正确的Cookie: ${JSON.stringify(cookie)}`);
                        continue;
                    }
                    console.log(`Setting cookie: ${cookie.name}`);
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
            
            // 重新加载当前页面以应用Cookie
            console.log('重新加载页面以应用Cookie...');
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            console.log('页面重新加载完成，等待Cookie生效...');
            
            // 等待Cookie生效
            const waitTime = 5000;
            console.log(`等待 ${waitTime/1000} 秒让Cookie稳定生效...`);
            await this.wait(waitTime);
            

        } catch (error) {
            console.error(`Cookie注入过程中出错: ${error.message}`);
            throw error;
        }
    }

    // 导航到目标页面
    async navigateToPage(url) {
        console.log(`正在导航到: ${url}`);
        try {
            if (typeof url !== 'string') {
                console.error('URL is not a string:', url);
                throw new Error('URL is not a string');
            }

            if (!url.startsWith('http')) {
            console.error('URL is not a valid HTTP URL:', url);
                throw new Error('URL is not a valid HTTP URL');
            }

            // 监听请求失败事件
            this.page.on('requestfailed', request => {
                console.error(`Request failed: ${request.url()} ${request.failure().errorText}`);
            });

            // 监听响应事件
            // this.page.on('response', response => {
            //     console.log(`Response: ${response.url()} ${response.status()} ${response.statusText()}`);
            // });
 
            // 访问目标链接
            console.log(`正在导航到目标链接: ${url}`);
            const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000, maxRedirects: 20 });
            console.log('页面加载完成');
            if (response && !response.ok()) {
                console.error(`HTTP error: ${response.status()} ${response.statusText()}`);
                return false;
            }
            return true;

        } catch (error) {
            console.error(`导航失败: ${error.message}`);
            console.log('等待15秒后继续执行...');
            await this.wait(15000);
            return false;
        } finally {
            this.page.removeAllListeners('requestfailed');
            this.page.removeAllListeners('response');
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
                // 检查是否存在用户头像或个人中心链接等登录状态的标志
                const avatarElement = document.querySelector('.gn_nav_list .gn_person');
                const usernameElement = document.querySelector('.gn_nav_list .S_txt1');
                
                // 记录找到的元素信息
                const result = {
                    hasAvatar: !!avatarElement,
                    hasUsername: !!usernameElement,
                    isLoggedIn: !!(avatarElement || usernameElement)
                };
                
                // 在浏览器控制台输出详细信息
                console.log('登录状态检查结果:', JSON.stringify(result));
                
                return result.isLoggedIn;
            });
            
            console.log(`登录状态检查结果: ${loginStatusElement ? '已登录' : '未登录'}`);
            return loginStatusElement;
        } catch (error) {
            console.error(`检查登录状态时出错: ${error.message}`);
            return false;
        }
    }
}

module.exports = WeiboBrowserCore;