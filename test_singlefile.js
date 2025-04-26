const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// 配置项
const singleFileExtensionPath = path.resolve(__dirname, 'SingleFile'); // SingleFile插件目录
const cookieFilePath = path.resolve(__dirname, 'weibo_cookie.json'); // cookie文件路径

// 创建全局浏览器实例
let browser;

// 创建readline接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 等待用户确认
function waitForUserConfirmation(message) {
    return new Promise(resolve => {
        rl.question(message, () => {
            resolve();
        });
    });
}

// 从data/weibo目录下读取URL列表
async function getUrlsFromWeiboData() {
    const weiboDataDir = path.resolve(__dirname, 'data/weibo');
    const urls = [];
    
    // 遍历weibo数据目录下的所有用户文件夹
    const userDirs = fs.readdirSync(weiboDataDir)
        .filter(item => fs.statSync(path.join(weiboDataDir, item)).isDirectory());
    
    for (const userDir of userDirs) {
        const userDataPath = path.join(weiboDataDir, userDir, 'user_data.json');
        if (fs.existsSync(userDataPath)) {
            const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            if (userData.posts) {
                userData.posts.forEach(post => {
                    if (post.postUrl) {
                        urls.push(post.postUrl);
                    }
                });
            }
        }
    }
    
    return urls;
}

// 加载cookie
async function loadCookies(page) {
    if (fs.existsSync(cookieFilePath)) {
        const cookiesString = fs.readFileSync(cookieFilePath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log('Cookie已加载');
    } else {
        console.error('Cookie文件不存在:', cookieFilePath);
    }
}

// 保存页面
async function savePageWithSingleFile(url, outputPath) {
    try {
        if (!browser) {
            // 启动浏览器并加载SingleFile插件
            browser = await puppeteer.launch({
                headless: false,
                args: [
                    `--load-extension=${singleFileExtensionPath}`,
                    `--disable-extensions-except=${singleFileExtensionPath}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
            
            // 等待用户手动启用插件
            await waitForUserConfirmation('请在浏览器中手动启用SingleFile插件，然后按回车继续...');
        }

        const page = await browser.newPage();
        
        // 加载cookie
        await loadCookies(page);

        // 设置下载行为
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: path.dirname(outputPath)
        });
        console.log(`下载路径设置为: ${path.dirname(outputPath)}`);

        // 监听下载事件
        let downloadCompletePromise = new Promise((resolve, reject) => {
            page.on('response', async response => {
                const headers = response.headers();
                if (headers['content-disposition']?.includes('attachment')) {
                    try {
                        const buffer = await response.buffer();
                        fs.writeFileSync(outputPath, buffer);
                        console.log(`文件已保存到: ${outputPath}`);
                        resolve();
                    } catch (error) {
                        console.error(`处理下载时发生错误: ${error}`);
                        reject(error);
                    }
                }
            });
        });

        // 导航到目标URL
        console.log(`正在访问: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('页面加载完成');

        // 等待SingleFile插件加载完成
        console.log('等待SingleFile插件加载...');
        await page.waitForFunction(() => {
            return window.singlefile && window.singlefile.savePage;
        }, { timeout: 10000 }).catch(() => {
            throw new Error('SingleFile插件加载超时');
        });

        // 调用SingleFile插件保存页面
        console.log('正在调用SingleFile保存页面...');
        await page.evaluate(async (saveOptions) => {
            try {
                await window.singlefile.savePage(saveOptions);
            } catch (error) {
                throw new Error(`SingleFile保存失败: ${error.message}`);
            }
        }, { filename: path.basename(outputPath), url: url });

        console.log('等待下载完成...');
        await downloadCompletePromise;
        console.log('页面保存完成');

    } catch (error) {
        console.error(`保存页面时出错: ${error}`);
        throw error;
    } catch (error) {
        console.error(`保存页面时出错: ${error}`);
        throw error;
    }
}
}

// 主函数
async function main() {
    try {
        // 获取所有URL
        const urls = await getUrlsFromWeiboData();
        console.log(`共找到 ${urls.length} 个URL待处理`);

        // 创建保存目录
        const saveDir = path.resolve(__dirname, 'data/weibo_pages');
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        // 逐个处理URL
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const filename = `page_${i + 1}.html`;
            const outputPath = path.join(saveDir, filename);

            console.log(`\n处理第 ${i + 1}/${urls.length} 个URL: ${url}`);
            try {
                await savePageWithSingleFile(url, outputPath);
                console.log(`成功保存页面到: ${outputPath}`);
            } catch (error) {
                console.error(`处理URL失败: ${url}`, error);
                // 继续处理下一个URL
                continue;
            }
        }

        console.log('\n所有页面处理完成');
    } catch (error) {
        console.error('程序执行出错:', error);
    }
}

// 运行程序
main().finally(async () => {
    if (browser) {
        await browser.close();
        console.log('浏览器已关闭');
    }
    rl.close();
});