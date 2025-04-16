const puppeteer = require('puppeteer-core');
const weiboConfig = require('../weiboConfig');
const WeiboUserCapture = require('./weiboUserCapture');

class WeiboBrowserCore {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userCapture = null;
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
        
        this.browser = await puppeteer.launch(weiboConfig.BROWSER_CONFIG);
        const pages = await this.browser.pages();
        this.page = pages[0];
        await this.page.setViewport({ width: 1400, height: 900 });
        this.userCapture = new WeiboUserCapture(this.page);

        // 设置控制台日志监听
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('浏览器日志:', val)).catch(() => {});
        });
    }

    // 加载Cookie
    async captureUserPosts(maxItems) {
        return this.userCapture.captureUserPosts(maxItems);
    }

    async loadCookies(cookies) {
        console.log('========== 微博登录流程开始 ==========');
        console.log('1. 准备登录weibo.com');
        
        // 检查是否为手动模式
        if (weiboConfig.MANUAL_MODE) {
            console.log('\n处于手动模式，请在浏览器中进行必要的操作，完成后按回车键继续...');
            // 等待用户按回车键
            await new Promise(resolve => {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                readline.question('', () => {
                    readline.close();
                    resolve();
                });
            });
            console.log('继续执行任务...');
        }

        try {
            // 先访问微博首页，确保能正确注入cookie
            console.log('正在访问微博首页...');
            await this.page.goto('https://weibo.com', { waitUntil: 'networkidle2', timeout: 60000 });
            console.log('微博首页加载完成，等待页面稳定...');
            await this.wait(weiboConfig.WAIT_TIMES.PAGE_LOAD * 1.5); // 增加等待时间
            console.log('页面已稳定，准备注入Cookie');
            
            if (!cookies || cookies.length === 0) {
                throw new Error('Cookie数据为空或格式不正确');
            }
            
            console.log('========== 2. 开始注入Cookie ==========');
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
            
            console.log('重新加载页面以应用Cookie...');
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            console.log('页面重新加载完成，等待Cookie生效...');
            
            // 增加Cookie注入后的等待时间，固定为10秒
            const waitTime = 10000; // 固定等待10秒，确保cookie稳定生效
            console.log(`等待 ${waitTime/1000} 秒让Cookie稳定生效...`);
            await this.wait(waitTime);
            
            // 再次验证页面状态
            console.log('再次验证页面状态...');
            try {
                await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                console.log('页面再次加载完成，确保Cookie已完全生效');
                await this.wait(2000); // 短暂等待页面稳定
            } catch (reloadError) {
                console.warn(`页面重新加载失败: ${reloadError.message}，但将继续执行`);
            }
            
            console.log('========== 3. 等待页面稳定后准备访问搜索链接 ==========');
            // 验证Cookie是否生效
            const isLoggedIn = await this.checkLoginStatus();
            if (!isLoggedIn) {
                console.warn('警告: Cookie可能未正确注入，登录状态未检测到');
                console.log('将尝试继续执行，但可能需要手动登录');
            } else {
                console.log('Cookie注入成功，已检测到登录状态');
                console.log('页面已稳定，可以开始访问搜索链接');
            }
        } catch (error) {
            console.error(`Cookie注入过程中出错: ${error.message}`);
            console.log('将继续执行，但可能需要手动登录');
        }
        console.log('========== 微博登录流程结束 ==========');
    }

    // 导航到目标页面
    async navigateToPage(url) {
        console.log('========== 4. 开始访问搜索链接 ==========');
        console.log(`正在导航到: ${url}`);
        try {
            // 确保在访问目标链接前已经完成了cookie注入流程
            const cookies = await this.page.cookies();
            if (!cookies || cookies.length === 0) {
                console.warn('警告: 未检测到Cookie，可能会导致访问失败');
                console.log('尝试重新访问微博首页并等待...');
                await this.page.goto('https://weibo.com', { waitUntil: 'networkidle2', timeout: 60000 });
                await this.wait(5000); // 等待5秒确保页面加载
            }
            
            // 访问目标链接
            console.log(`正在导航到目标链接: ${url}`);
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            console.log('页面加载完成，等待页面稳定...');
            await this.wait(weiboConfig.WAIT_TIMES.PAGE_LOAD);
            console.log('页面已稳定，导航成功');
            return true;
        } catch (error) {
            console.error(`导航失败: ${error.message}`);
            console.log('等待5秒后继续执行...');
            await this.wait(5000);
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