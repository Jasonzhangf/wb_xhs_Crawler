const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function saveCookies(page, filename) {
    const cookies = await page.cookies();
    fs.writeFileSync(filename, JSON.stringify(cookies, null, 2));
    console.log(`Cookies已保存到 ${filename}`);
}

async function getXiaohongshuCookies() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });
    
    await page.goto('https://www.xiaohongshu.com');
    console.log('请在浏览器中登录小红书，登录完成后按回车键...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    await saveCookies(page, path.join(__dirname, 'xiaohongshu_cookie.json'));
    await browser.close();
}

async function getWeiboCookies() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });
    
    await page.goto('https://www.weibo.com');
    console.log('请在浏览器中登录微博，登录完成后按回车键...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    await saveCookies(page, path.join(__dirname, 'weibo_cookie.json'));
    await browser.close();
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--xiaohongshu')) {
        await getXiaohongshuCookies();
    } else if (args.includes('--weibo')) {
        await getWeiboCookies();
    } else {
        console.log('请使用 --xiaohongshu 或 --weibo 参数指定要获取的cookie类型');
    }
}

main().catch(console.error);