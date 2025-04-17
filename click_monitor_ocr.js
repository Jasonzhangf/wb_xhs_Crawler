const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

// 计算URL的哈希值
function hashUrl(url) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex');
}

// 下载图片函数
async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

// OCR文字识别函数
async function extractTextFromImage(imagePath) {
    return new Promise((resolve, reject) => {
        const absolutePath = path.resolve(imagePath).replace(/\\/g, '\\\\');
        console.log('开始OCR处理，图片路径:', absolutePath);
        const pythonProcess = spawn('python', [
            '-c',
            `
import easyocr
import sys
import os
import io
import traceback

# 设置标准输出为UTF-8编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    if not os.path.exists(r'''${absolutePath}'''):
        print(f"OCR Error: 图片文件不存在: {r'''${absolutePath}'''}", file=sys.stderr)
        sys.exit(1)
    
    try:
        reader = easyocr.Reader(['ch_sim','en'])
        result = reader.readtext(r'''${absolutePath}''')
    except Exception as e:
        print(f"OCR Error: 读取图片失败: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
        
    if not result:
        print("警告：OCR未识别到任何文字")
        sys.exit(0)
    
    # 使用列表推导式和join方法处理OCR结果
    text_parts = [item[1] for item in result if item and len(item) > 1]
    if text_parts:
        text = "\n".join(text_parts)
        print(text)
        sys.exit(0)
    else:
        print("警告：OCR结果格式无效")
        sys.exit(0)
except Exception as e:
    print(f"OCR Error: 未预期的错误: {str(e)}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`
        ], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let outputData = '';
        let errorData = '';

        pythonProcess.stdout.setEncoding('utf-8');
        pythonProcess.stderr.setEncoding('utf-8');

        pythonProcess.stdout.on('data', (data) => {
            outputData += data;
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data;
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`OCR处理失败: ${errorData}`);
                console.log(`继续处理其他图片...`);
                resolve('');
            } else {
                resolve(outputData.trim());
            }
        });
    });
}

const COOKIE_PATH = 'xiaohongshu_cookie.json';
const SEARCHED_PATH = 'searched.json';
const DATA_DIR = 'xiaohongshu_data';
const KEYWORD = process.argv[2] || '关税';
const DATA_V_SELECTORS = ['[data-v-51ec0135]', '[data-v-a264b01a]'];
const COMMENT_SELECTORS = ['[data-v-4a19279a]', '[data-v-aed4aacc]'];
const MIN_WAIT_TIME = 2000;
const MAX_WAIT_TIME = 4000;
const MAX_ITEMS = 5; // 最大点击帖子数量

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

(async () => {
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--window-size=1400,900'],
        channel: 'chrome',
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const pages = await browser.pages();
    const page = pages[0];
    await page.setViewport({ width: 1400, height: 900 });

    // 控制台打印浏览器内console.log内容
    page.on('console', msg => {
        for (let i = 0; i < msg.args().length; ++i)
            msg.args()[i].jsonValue().then(val => console.log('浏览器日志:', val)).catch(() => {});
    });

    // 加载cookie
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle2' });
    for (const cookie of cookies) {
        await page.setCookie(cookie);
    }
    await page.reload({ waitUntil: 'networkidle2' });

    // 导航到搜索页面
    const encodedKeyword = encodeURIComponent(KEYWORD);
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodedKeyword}&source=web&type=51`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 搜索指定data-v属性的元素
    const searchedElements = await page.evaluate((selectors) => {
        const elements = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 &&
                    el.offsetParent !== null && 
                    !el.disabled && 
                    getComputedStyle(el).display !== 'none' &&
                    getComputedStyle(el).visibility !== 'hidden') {
                    const text = el.textContent || el.innerText || '';
                    if (text.trim()) {
                        elements.push({
                            text: text.trim(),
                            selector: selector
                        });
                    }
                }
            });
        });
        return elements;
    }, DATA_V_SELECTORS);

    console.log(`找到 ${searchedElements.length} 个符合条件的元素`);

    // 随机等待函数
    async function randomWait() {
        const waitTime = Math.floor(Math.random() * (MAX_WAIT_TIME - MIN_WAIT_TIME) + MIN_WAIT_TIME);
        console.log(`等待 ${waitTime/1000} 秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 保存的结果数组
    const results = [];
    let clickCount = 0;

    for (const element of searchedElements) {
        if (clickCount >= MAX_ITEMS) {
            console.log(`已达到最大点击次数 ${MAX_ITEMS}，停止点击`);
            break;
        }

        try {
            console.log(`尝试点击元素: ${element.text}`);
            
            // 使用选择器定位元素
            const selector = DATA_V_SELECTORS.join(', ');
            try {
                await page.waitForSelector(selector, {
                    visible: true,
                    timeout: 5000
                });
                
                // 找到所有匹配的元素
                const elements = await page.$$(selector);
                
                // 找到与当前文本匹配的元素
                let targetElement = null;
                for (const el of elements) {
                    const text = await page.evaluate(el => el.textContent || '', el);
                    if (text && text.indexOf(element.text) !== -1) {
                        targetElement = el;
                        break;
                    }
                }
                
                if (!targetElement) {
                    console.log(`元素未找到或不可见: ${element.text}`);
                    continue;
                }
                
                // 确保元素在视图中
                await page.evaluate(el => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, targetElement);
                
                // 等待滚动完成
                await new Promise(resolve => setTimeout(resolve, 500));

            // 验证元素是否可见和可交互
            const isVisible = await page.evaluate(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && 
                       rect.height > 0 && 
                       window.getComputedStyle(el).visibility !== 'hidden' &&
                       window.getComputedStyle(el).display !== 'none';
            }, targetElement);

            if (!isVisible) {
                console.log(`元素不可见或不可交互: ${element.text}`);
                continue;
            }

            // 执行点击操作
            await targetElement.click();
            console.log(`成功点击元素: ${element.text}`);
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (MAX_WAIT_TIME - MIN_WAIT_TIME) + MIN_WAIT_TIME)));
        } catch (error) {
            console.error(`处理元素时出错: ${element.text}`, error);
            continue;
        }

            // 获取当前URL和页面内容
            const currentUrl = page.url();
            console.log('当前页面URL:', currentUrl);

            // 先获取帖子基本信息
            const pageContent = await page.evaluate(() => {
                const metaDesc = document.querySelector('meta[name="description"]');
                const content = metaDesc ? metaDesc.getAttribute('content') : '';
                
                // 获取帖子正文内容
                const noteContent = document.querySelector('.content')
                    ? document.querySelector('.content').innerText
                    : '';
                
                return {
                    metaContent: content,
                    noteContent: noteContent
                };
            });

            // 创建帖子专属文件夹，使用note_序号作为文件夹名
            const postDir = path.join(DATA_DIR, `note_${clickCount + 1}`);
            if (!fs.existsSync(postDir)) {
                fs.mkdirSync(postDir);
            }

            // 获取并下载帖子正文中的图片
            const images = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('div.media-container img'));
                return imgs.map(img => img.src).filter(src => src.startsWith('http'));
            });

            const imageResults = [];
            const processedUrls = new Set();
            let imageIndex = 1;
            
            for (const imgUrl of images) {
                // 检查URL是否已处理过
                const urlHash = hashUrl(imgUrl);
                if (processedUrls.has(urlHash)) {
                    console.log(`跳过重复图片: ${imgUrl}`);
                    continue;
                }
                processedUrls.add(urlHash);
                
                const ext = path.extname(new URL(imgUrl).pathname).split('?')[0] || '.jpg';
                const imagePath = path.join(postDir, `image_${imageIndex}${ext}`);
                
                try {
                    await downloadImage(imgUrl, imagePath);
                    console.log(`正在处理图片OCR: ${imagePath}`);
                    // 确保图片下载完成后立即执行OCR
                    const ocrText = await extractTextFromImage(imagePath);
                    if (!ocrText) {
                        console.log(`OCR未能识别文字: ${imagePath}`);
                    }
                    imageResults.push({
                        url: imgUrl,
                        localPath: path.relative(DATA_DIR, imagePath),
                        ocrText: ocrText || ''
                    });
                    imageIndex++;
                } catch (err) {
                    console.error(`下载或处理图片失败: ${err.message}`);
                }
            }

            // 获取评论内容
            const comments = await page.evaluate((commentSelectors) => {
                const comments = [];
                const commentElements = [];
                commentSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el.offsetParent !== null && 
                            getComputedStyle(el).display !== 'none' &&
                            getComputedStyle(el).visibility !== 'hidden') {
                            commentElements.push(el);
                        }
                    });
                });
                console.log(`找到 ${commentElements.length} 个评论区元素`);
                
                commentElements.forEach(element => {
                    const commentContent = element.innerText;
                    if (commentContent && commentContent.trim()) {
                        comments.push(commentContent.trim());
                    }
                });
                
                return comments;
            }, COMMENT_SELECTORS);

            // 保存帖子内容
            const postData = {
                url: currentUrl,
                title: element.text,
                metaContent: pageContent.metaContent,
                noteContent: pageContent.noteContent,
                comments: comments,
                images: imageResults,
                crawlTime: new Date().toISOString()
            };

            fs.writeFileSync(
                path.join(postDir, 'content.json'),
                JSON.stringify(postData, null, 2),
                { encoding: 'utf8' }
            );

            // 保存结果
            results.push({
                text: element.text,
                url: currentUrl,
                contentPath: path.join(postDir, 'content.json')
            });

            clickCount++;
            console.log(`已点击 ${clickCount} 个帖子`);

            // 尝试关闭详情页（按ESC键）
            await page.keyboard.press('Escape');
            await randomWait();
        } catch (error) {
            console.error(`处理元素时出错: ${element.text}`, error);
            continue;
        }
    }

    // 保存搜索结果
    fs.writeFileSync(SEARCHED_PATH, JSON.stringify(results, null, 2));
    console.log('搜索结果已保存到:', SEARCHED_PATH);

    // 生成汇总文件
    const allPosts = [];
    for (const result of results) {
        const contentPath = result.contentPath;
        if (fs.existsSync(contentPath)) {
            const postData = JSON.parse(fs.readFileSync(contentPath, { encoding: 'utf8' }));
            allPosts.push(postData);
        }
    }

    const currentDate = new Date().toISOString().split('T')[0];
    const summaryFileName = `${KEYWORD}_${currentDate}_${allPosts.length}条.json`;
    fs.writeFileSync(
        path.join(DATA_DIR, summaryFileName),
        JSON.stringify(allPosts, null, 2),
        { encoding: 'utf8' }
    );
    console.log('汇总数据已保存到:', summaryFileName);

    // 关闭浏览器
    await browser.close();
    console.log('点击任务完成，浏览器已关闭。');
})();
