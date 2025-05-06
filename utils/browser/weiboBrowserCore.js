const fs = require('fs');
const puppeteer = require('puppeteer-core');
const BrowserConfig = require('./browserConfig');
const Randomizer = require('../randomizer');
const WeiboUserCapture = require('./weiboUserCapture');
const OCRProcessor = require('../ocrProcessor');
const WeiboFileSystem = require('../weiboFileSystem');

class WeiboBrowserCore {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.userCapture = null;
        this.fileSystem = WeiboFileSystem;
        this.visibleMode = options.visibleMode || false;
        this.browserConfig = options.browserConfig || {
            headless: false,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
        };
    }
    
    getBrowserConfig() {
        return BrowserConfig.getDefaultConfig({
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            timeout: 30000,
            headless: !this.visibleMode
        });
    }

    // Initialize browser
    async initialize() {
        // 加载配置
        const weiboConfig = require('../weiboConfig');
        const randomConfig = weiboConfig.RANDOM_BEHAVIOR || {};
        
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
        
        // 使用getBrowserConfig方法获取浏览器配置
        const config = this.getBrowserConfig();
        

        
        // Verify executablePath exists before launch
        if (config.executablePath) {
            console.log('Verifying Chrome executable path:', config.executablePath);
            
            // Ensure path ends with chrome.exe
            if (!config.executablePath.toLowerCase().endsWith('chrome.exe')) {
                // If path ends with .exe but not chrome.exe, or is missing .exe
                const fixedPath = config.executablePath.endsWith('.exe') 
                    ? config.executablePath.replace(/([^\\]+)\.exe$/i, 'chrome.exe')
                    : path.join(config.executablePath, 'chrome.exe');
                
                // Additional validation for Windows paths
                if (process.platform === 'win32') {
                    const normalizedPath = path.normalize(fixedPath).replace(/\\/g, '\\');
                    
                    // First check if path exists as is
                    if (fs.existsSync(normalizedPath)) {
                        console.log(`Correcting Chrome executable path from ${config.executablePath} to ${normalizedPath}`);
                        config.executablePath = normalizedPath;
                    } else {
                        // If path ends with 'Application' directory, look for chrome.exe inside it
                        if (path.basename(normalizedPath).toLowerCase() === 'application') {
                            const chromePath = path.join(normalizedPath, 'chrome.exe');
                            if (fs.existsSync(chromePath)) {
                                console.log(`Found chrome.exe in Application directory: ${chromePath}`);
                                config.executablePath = chromePath;
                            } else {
                                // Try parent directory if path points to Application folder
                                const parentDir = path.dirname(normalizedPath);
                                if (path.basename(parentDir).toLowerCase() === 'application') {
                                    const chromePath = path.join(parentDir, 'chrome.exe');
                                    if (fs.existsSync(chromePath)) {
                                        console.log(`Found chrome.exe in parent directory: ${chromePath}`);
                                        config.executablePath = chromePath;
                                    } else {
                                        console.error(`Chrome executable path must end with chrome.exe and be valid: ${config.executablePath}`);
                                        throw new Error('Invalid Chrome executable path format');
                                    }
                                } else {
                                    console.error(`Chrome executable path must end with chrome.exe and be valid: ${config.executablePath}`);
                                    throw new Error('Invalid Chrome executable path format');
                                }
                            }
                        } else {
                            console.error(`Chrome executable path must end with chrome.exe and be valid: ${config.executablePath}`);
                            throw new Error('Invalid Chrome executable path format');
                        }
                    }
                } else if (fs.existsSync(fixedPath)) {
                    console.log(`Correcting Chrome executable path from ${config.executablePath} to ${fixedPath}`);
                    config.executablePath = fixedPath;
                } else {
                    console.error(`Chrome executable path must end with chrome.exe and be valid: ${config.executablePath}`);
                    throw new Error('Invalid Chrome executable path format');
                }
            }
            
            // Verify the path exists and is a file
            if (!fs.existsSync(config.executablePath)) {
                console.error(`Chrome executable not found at: ${config.executablePath}`);
                throw new Error('Chrome executable path is invalid');
            }
            
            if (fs.statSync(config.executablePath).isDirectory()) {
                console.error('Chrome executable path points to a directory, not a file');
                throw new Error('Invalid Chrome executable path - is a directory');
            }
            
            // Log full config before launch
            
            console.log('Chrome executable path verified successfully');
        } else {
            console.warn('No executablePath specified in browser config');
        }
        
        try {
            this.browser = await puppeteer.launch(config);
            const pages = await this.browser.pages();
            this.page = pages[0];
        } catch (error) {
            console.error('浏览器初始化失败:', error);
            console.error('详细错误堆栈:', error.stack);
            console.error('当前配置:', JSON.stringify(config, null, 2));
            console.error('可执行文件路径验证:', fs.existsSync(config.executablePath) ? '存在' : '不存在');
            if (config.executablePath) {
                console.error('可执行文件路径:', config.executablePath);
                console.error('路径类型:', fs.statSync(config.executablePath).isDirectory() ? '目录' : '文件');
            }
            throw error;
        }
        
        // 随机化视口大小
        let viewportWidth = 1400;
        let viewportHeight = 900;
        
        if (randomConfig.viewport && randomConfig.viewport.randomize) {
            const widthRange = randomConfig.viewport.width_range || [1300, 1600];
            const heightRange = randomConfig.viewport.height_range || [800, 1000];
            
            viewportWidth = Math.floor(Math.random() * (widthRange[1] - widthRange[0])) + widthRange[0];
            viewportHeight = Math.floor(Math.random() * (heightRange[1] - heightRange[0])) + heightRange[0];
            
            console.log(`使用随机视口大小: ${viewportWidth}x${viewportHeight}`);
        } else {
            // 默认随机化，在标准尺寸基础上添加随机偏移
            viewportWidth = 1400 + Math.floor(Math.random() * 100) - 50;
            viewportHeight = 900 + Math.floor(Math.random() * 100) - 50;
        }
        
        await this.page.setViewport({ width: viewportWidth, height: viewportHeight });

        // 使用随机用户代理
        if (!randomConfig.user_agent || randomConfig.user_agent.randomize !== false) {
            const userAgent = Randomizer.getUserAgent();
            console.log(`使用随机用户代理: ${userAgent}`);
            await this.page.setUserAgent(userAgent);
            
            // 设置随机请求头
            const randomHeaders = Randomizer.getRandomHeaders();
            await this.page.setExtraHTTPHeaders(randomHeaders);
            console.log('已设置随机请求头');
        }

        // 禁用WebDriver标志，降低被检测风险
        await this.page.evaluateOnNewDocument(() => {
            // 覆盖navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // 覆盖navigator.plugins和navigator.languages，使其更像真实浏览器
            if (navigator.plugins.length === 0) {
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
            }
            
            // 添加一些随机的浏览器特性标志
            window.chrome = {};
            window.chrome.runtime = {};
            
            // 修改WebGL信息，避免指纹识别
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                // 随机化RENDERER和VENDOR信息
                if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                    return 'Intel Open Source Technology Center';
                }
                if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                    return 'Mesa DRI Intel(R) HD Graphics';
                }
                return getParameter.apply(this, arguments);
            };
        });

        this.userCapture = new WeiboUserCapture(this.page, this.fileSystem);

        // Set console log listener
        this.page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                msg.args()[i].jsonValue().then(val => console.log('Browser log:', val)).catch(() => {});
        });

        // 随机等待时间，使初始化过程更自然
        let initWaitTime = 5000;
        if (randomConfig.wait_times && randomConfig.wait_times.randomize) {
            initWaitTime = Randomizer.getWaitTime(3000, 7000);
        }
        console.log(`初始化等待: ${initWaitTime}ms`);
        await this.wait(initWaitTime);
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
            
            // 在导航前随机等待一段时间，模拟人类行为
            const preNavigationWait = Randomizer.getWaitTime(500, 2000);
            console.log(`导航前等待: ${preNavigationWait}ms`);
            await this.wait(preNavigationWait);

            while (retryCount < maxRetries) {
                try {
                    // 监听请求失败事件
                    this.page.on('requestfailed', request => {
                        console.error(`Request failed: ${request.url()} ${request.failure().errorText}`);
                    });
                    
                    // 每次重试时使用新的随机用户代理
                    if (retryCount > 0) {
                        const newUserAgent = Randomizer.getUserAgent();
                        console.log(`重试使用新的用户代理: ${newUserAgent}`);
                        await this.page.setUserAgent(newUserAgent);
                    }

                    // 访问目标链接
                    console.log(`正在导航到目标链接: ${url} (尝试 ${retryCount + 1}/${maxRetries})`);
                    
                    // 使用随机的导航选项
                    const timeout = 60000 + Math.floor(Math.random() * 10000); // 60-70秒随机超时
                    const response = await this.page.goto(url, { 
                        waitUntil: 'networkidle2', 
                        timeout: timeout, 
                        maxRedirects: 20 
                    });
                    
                    if (!response) {
                        throw new Error('页面加载失败，未收到响应');
                    }
                    
                    if (!response.ok()) {
                        throw new Error(`HTTP错误: ${response.status()} ${response.statusText()}`);
                    }

                    // 随机等待页面加载完成
                    const loadWaitTime = Randomizer.getWaitTime(2000, 5000);
                    console.log(`页面加载后等待: ${loadWaitTime}ms`);
                    await this.wait(loadWaitTime);
                    console.log('页面加载完成，等待内容显示...');
                    
                    // 模拟人类滚动行为
                    await this.simulateHumanScrolling();

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
                    
                    // 随机等待一段时间再重试
                    if (retryCount < maxRetries - 1) {
                        const retryWaitTime = Randomizer.getWaitTime(3000, 8000);
                        console.log(`等待 ${retryWaitTime}ms 后重试...`);
                        await this.wait(retryWaitTime);
                    }
                    
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
    
    getBrowserConfig() {
        return BrowserConfig.getDefaultConfig({
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            timeout: 30000,
            headless: !this.visibleMode
        });
    }

    // 模拟人类滚动行为
    async simulateHumanScrolling() {
        try {
            console.log('模拟人类滚动行为...');
            
            // 加载配置
            const weiboConfig = require('../weiboConfig');
            const randomConfig = weiboConfig.RANDOM_BEHAVIOR || {};
            const scrollConfig = randomConfig.scroll || {};
            
            // 检查是否启用滚动行为
            if (scrollConfig.enabled === false) {
                console.log('随机滚动行为已禁用，跳过滚动');
                return true;
            }
            
            // 获取页面高度
            const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
            const viewportHeight = await this.page.evaluate(() => window.innerHeight);
            
            // 决定滚动次数 (使用配置或默认1-3次随机)
            const scrollCountRange = scrollConfig.scroll_count_range || [1, 3];
            const scrollCount = Math.floor(Math.random() * 
                (scrollCountRange[1] - scrollCountRange[0] + 1)) + scrollCountRange[0];
            console.log(`将执行 ${scrollCount} 次随机滚动`);
            
            for (let i = 0; i < scrollCount; i++) {
                // 获取随机滚动参数
                let scrollSpeed;
                if (scrollConfig.scroll_speed_range) {
                    const [min, max] = scrollConfig.scroll_speed_range;
                    scrollSpeed = Math.floor(Math.random() * (max - min + 1)) + min;
                } else {
                    const scrollParams = Randomizer.getScrollParameters();
                    scrollSpeed = scrollParams.speed;
                }
                
                // 计算随机滚动位置 (避免滚动过头)
                const maxScroll = pageHeight - viewportHeight;
                
                // 每次滚动的距离随机化，但呈现出一定的模式
                // 通常先快速浏览，然后可能回滚查看之前的内容
                let scrollTo;
                if (i === 0) {
                    // 第一次滚动通常是向下浏览
                    scrollTo = Math.min(
                        Math.floor((0.2 + Math.random() * 0.4) * maxScroll), // 滚动20%-60%
                        maxScroll
                    );
                } else if (i === scrollCount - 1 && scrollCount > 1 && Math.random() > 0.7) {
                    // 最后一次滚动有30%的概率回到顶部或接近顶部
                    scrollTo = Math.floor(Math.random() * 0.2 * maxScroll);
                } else if (Math.random() > 0.8) {
                    // 20%的概率稍微向上滚动，查看之前的内容
                    const currentPosition = await this.page.evaluate(() => window.pageYOffset);
                    scrollTo = Math.max(currentPosition - Math.floor(Math.random() * 300), 0);
                } else {
                    // 通常情况下继续向下滚动
                    const currentPosition = await this.page.evaluate(() => window.pageYOffset);
                    const remainingScroll = maxScroll - currentPosition;
                    if (remainingScroll <= 0) {
                        // 已经到底部，尝试回滚一些
                        scrollTo = currentPosition - Math.floor(Math.random() * 300);
                    } else {
                        // 继续向下，但不会一次滚动太多
                        const scrollAmount = Math.min(
                            Math.floor(Math.random() * remainingScroll * 0.7),
                            500 // 最大滚动距离
                        );
                        scrollTo = currentPosition + scrollAmount;
                    }
                }
                
                console.log(`滚动到位置: ${scrollTo}px (速度: ${scrollSpeed}ms)`);
                
                // 执行平滑滚动
                await this.page.evaluate((scrollTo, speed, useNaturalScrolling) => {
                    return new Promise(resolve => {
                        // 获取当前滚动位置
                        const startPosition = window.pageYOffset;
                        const distance = scrollTo - startPosition;
                        const duration = speed;
                        let startTime = null;
                        
                        // 使用缓动函数使滚动更自然
                        function easeInOutQuad(t) {
                            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                        }
                        
                        // 更自然的滚动曲线，模拟人类加速和减速
                        function naturalEase(t) {
                            // 开始慢，中间快，结束慢
                            return t < 0.2 ? 3 * t * t :
                                   t > 0.8 ? 1 - Math.pow(-2 * t + 2, 2) / 2 :
                                   0.5 + (t - 0.5) * 0.8;
                        }
                        
                        function scroll(timestamp) {
                            if (!startTime) startTime = timestamp;
                            const elapsed = timestamp - startTime;
                            const progress = Math.min(elapsed / duration, 1);
                            const easeProgress = useNaturalScrolling ? naturalEase(progress) : easeInOutQuad(progress);
                            
                            window.scrollTo(0, startPosition + distance * easeProgress);
                            
                            if (elapsed < duration) {
                                window.requestAnimationFrame(scroll);
                            } else {
                                resolve();
                            }
                        }
                        
                        window.requestAnimationFrame(scroll);
                    });
                }, scrollTo, scrollSpeed, scrollConfig.natural_scrolling !== false);
                
                // 随机等待一段时间，模拟阅读内容
                const pauseRange = scrollConfig.pause_range || [1000, 3000];
                const readTime = Randomizer.getWaitTime(pauseRange[0], pauseRange[1]);
                console.log(`模拟阅读内容: ${readTime}ms`);
                await this.wait(readTime);
                
                // 偶尔模拟鼠标移动，更像真人浏览
                if (Math.random() > 0.7) {
                    const viewportWidth = await this.page.evaluate(() => window.innerWidth);
                    const randomX = Math.floor(Math.random() * viewportWidth);
                    const randomY = Math.floor(Math.random() * viewportHeight * 0.8) + 
                                   Math.floor(await this.page.evaluate(() => window.pageYOffset));
                    
                    await this.page.mouse.move(randomX, randomY);
                    console.log(`随机鼠标移动到: (${randomX}, ${randomY})`);
                }
            }
            
            return true;
        } catch (error) {
            console.error(`模拟滚动失败: ${error.message}`);
            return false;
        }
    }

    // 模拟人类点击行为
    async simulateHumanClick(selector) {
        try {
            // 加载配置
            const weiboConfig = require('../weiboConfig');
            const randomConfig = weiboConfig.RANDOM_BEHAVIOR || {};
            const clickConfig = randomConfig.click || {};
            
            // 检查是否启用点击行为
            if (clickConfig.enabled === false) {
                console.log('随机点击行为已禁用，使用普通点击');
                await this.page.click(selector);
                return true;
            }
            
            // 查找元素
            const element = await this.page.$(selector);
            if (!element) {
                console.error(`未找到元素: ${selector}`);
                return false;
            }
            
            // 获取元素位置和大小
            const box = await element.boundingBox();
            if (!box) {
                console.error(`无法获取元素位置: ${selector}`);
                return false;
            }
            
            // 计算点击位置（元素中心点附近的随机位置）
            let offsetRange = 5; // 默认偏移范围
            if (clickConfig.random_offset) {
                // 根据元素大小调整偏移范围，但不超过元素边界
                offsetRange = Math.min(box.width, box.height) * 0.2;
                if (offsetRange > 10) offsetRange = 10; // 最大偏移10像素
                if (offsetRange < 2) offsetRange = 2;  // 最小偏移2像素
            }
            
            const x = box.x + box.width / 2 + (Math.random() * offsetRange * 2 - offsetRange);
            const y = box.y + box.height / 2 + (Math.random() * offsetRange * 2 - offsetRange);
            
            // 生成鼠标移动轨迹
            const currentPosition = await this.page.evaluate(() => {
                return { x: window.mouseX || 0, y: window.mouseY || 0 };
            });
            
            // 使用配置中的轨迹点数或默认值
            const trackPoints = randomConfig.mouse_movement && randomConfig.mouse_movement.track_points || 20;
            const moveSpeedRange = randomConfig.mouse_movement && randomConfig.mouse_movement.move_speed_range || [50, 150];
            
            const mouseTrack = Randomizer.generateMouseTrack(
                currentPosition.x || 0, 
                currentPosition.y || 0, 
                x, 
                y,
                trackPoints
            );
            
            // 执行鼠标移动
            console.log(`模拟鼠标移动: 从(${currentPosition.x || 0}, ${currentPosition.y || 0})到(${x}, ${y})`);
            for (const point of mouseTrack) {
                await this.page.mouse.move(point.x, point.y);
                // 添加微小延迟使移动更自然
                const moveDelay = Math.random() * (moveSpeedRange[1] - moveSpeedRange[0]) / trackPoints + moveSpeedRange[0] / trackPoints;
                await this.wait(moveDelay);
            }
            
            // 随机延迟后点击
            const delayBeforeRange = clickConfig.delay_before_range || [100, 300];
            const clickDelay = Math.floor(Math.random() * (delayBeforeRange[1] - delayBeforeRange[0])) + delayBeforeRange[0];
            console.log(`点击前等待: ${clickDelay}ms`);
            await this.wait(clickDelay);
            
            // 执行点击 - 偶尔模拟双击或右键点击，更像真人
            if (Math.random() > 0.95) { // 5%的概率出现双击
                console.log('模拟双击行为');
                await this.page.mouse.down();
                await this.wait(Math.random() * 50 + 30);
                await this.page.mouse.up();
                await this.wait(Math.random() * 100 + 50);
                await this.page.mouse.down();
                await this.wait(Math.random() * 50 + 30);
                await this.page.mouse.up();
            } else if (Math.random() > 0.97) { // 3%的概率出现右键点击后取消
                console.log('模拟右键点击行为');
                await this.page.mouse.down({button: 'right'});
                await this.wait(Math.random() * 100 + 50);
                await this.page.mouse.up({button: 'right'});
                // 右键后通常会出现菜单，点击其他地方取消
                await this.wait(Math.random() * 300 + 200);
                await this.page.mouse.click(x + 100, y + 100);
            } else { // 正常左键点击
                await this.page.mouse.down();
                await this.wait(Math.random() * 100 + 50); // 随机按下时间
                await this.page.mouse.up();
            }
            
            // 点击后随机等待
            const delayAfterRange = clickConfig.delay_after_range || [500, 1500];
            const afterClickWait = Math.floor(Math.random() * (delayAfterRange[1] - delayAfterRange[0])) + delayAfterRange[0];
            console.log(`点击后等待: ${afterClickWait}ms`);
            await this.wait(afterClickWait);
            
            return true;
        } catch (error) {
            console.error(`模拟点击失败: ${error.message}`);
            return false;
        }
    }

    // 等待指定时间，支持随机化
    async wait(ms, randomize = true) {
        // 加载配置
        const weiboConfig = require('../weiboConfig');
        const randomConfig = weiboConfig.RANDOM_BEHAVIOR || {};
        
        // 如果启用了随机等待时间，则应用随机化
        if (randomize && randomConfig.wait_times && randomConfig.wait_times.randomize) {
            const variance = randomConfig.wait_times.variance_percentage || 30;
            const minTime = Math.max(ms * (1 - variance/100), 0);
            const maxTime = ms * (1 + variance/100);
            
            // 使用Randomizer生成更自然的等待时间
            const waitTime = Randomizer.getWaitTime(minTime, maxTime);
            console.log(`随机等待: ${waitTime}ms (基准: ${ms}ms, 变化率: ${variance}%)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return;
        }
        
        // 不随机化时直接等待指定时间
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