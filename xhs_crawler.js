const path = require('path');
const fs = require('fs');
const minimist = require('minimist');
const puppeteer = require('puppeteer');
const OCRProcessor = require('./utils/ocrProcessor');

// 处理小红书关键词搜索任务
async function processXhsKeywordTask(task, browser) {
    try {
        const keyword = task.keyword;
        const maxItems = task.max_items || 20;
        const noImage = task.noimage || false;
        
        // 创建任务文件夹
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const taskFolderName = `${keyword}_${dateStr}_${maxItems}条`;
        const taskDir = path.join(__dirname, 'data', taskFolderName);
        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true });
        }
        
        // 导航到搜索页面
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=unknown`;
        await page.goto(searchUrl);
        await page.waitForTimeout(3000);
        
        // 切换到图文模式
        const imageTabSelector = '[data-v-da963056] #image';
        await page.waitForSelector(imageTabSelector);
        await page.click(imageTabSelector);
        await page.waitForTimeout(2000);
        
        let processedCount = 0;
        let noteIndex = 1;
        const history = new Set();
        
        while (processedCount < maxItems) {
            // 获取帖子列表
            const titleElements = await page.$$('[data-v-a264b01a].title');
            
            for (const titleElement of titleElements) {
                if (processedCount >= maxItems) break;
                
                // 点击帖子
                await titleElement.click();
                await page.waitForTimeout(2000);
                
                // 获取帖子内容
                const content = await page.evaluate(() => {
                    const title = document.querySelector('[data-v-610be4fa][id="detail-title"].title')?.textContent?.trim() || '';
                    const text = document.querySelector('[data-v-610be4fa].note-text')?.textContent?.trim() || '';
                    const images = Array.from(document.querySelectorAll('img[data-xhs-img]')).map(img => img.src);
                    const comments = Array.from(document.querySelectorAll('[data-v-aed4aacc]')).map(comment => comment.textContent.trim());
                    return { title, text, images, comments };
                });
                
                // 创建帖子目录
                const noteDir = path.join(taskDir, noteIndex.toString());
                if (!fs.existsSync(noteDir)) {
                    fs.mkdirSync(noteDir);
                }
                
                // 下载图片和OCR处理
                const noteContent = {
                    title: content.title,
                    text: content.text,
                    images: [],
                    comments: content.comments,
                    ocr_results: []
                };
                
                if (!noImage) {
                    for (let i = 0; i < content.images.length; i++) {
                        try {
                            const imgPath = path.join(noteDir, `image_${i+1}.jpg`);
                            const imgResponse = await page.goto(content.images[i]);
                            fs.writeFileSync(imgPath, await imgResponse.buffer());
                            // 保存相对路径而非绝对路径
                            const relativePath = path.join(path.basename(noteDir), `image_${i+1}.jpg`);
                            noteContent.images.push(relativePath);
 zhon                        
                            // OCR处理，不打印调试信息
                            // 使用绝对路径进行OCR处理，但在结果中保存相对路径
                            const ocrResult = await OCRProcessor.extractTextFromImage(imgPath);
                            if (ocrResult) {
                                noteContent.ocr_results.push({
                                    image_index: i + 1,
                                    image_path: path.join(path.basename(noteDir), `image_${i+1}.jpg`),
                                    text: ocrResult
                                });
                            }
                        } catch (error) {
                            console.error(`下载图片失败: ${error.message}`);
                        }
                    }
                }
                
                // 保存帖子内容
                fs.writeFileSync(
                    path.join(noteDir, 'content.json'),
                    JSON.stringify(noteContent, null, 2)
                );
                
                // 退出帖子
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
                
                processedCount++;
                noteIndex++;
                console.log(`已处理 ${processedCount}/${maxItems} 条笔记`);
            }
            
            // 滚动页面加载更多内容
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await page.waitForTimeout(2000);
        }
        
        // 合并所有JSON文件
        const mergedData = [];
        for (let i = 1; i < noteIndex; i++) {
            const contentFile = path.join(taskDir, i.toString(), 'content.json');
            if (fs.existsSync(contentFile)) {
                const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
                
                // 确保图片路径是相对路径
                if (content.images && Array.isArray(content.images)) {
                    content.images = content.images.map(imgPath => {
                        // 如果是绝对路径，转换为相对路径
                        if (path.isAbsolute(imgPath)) {
                            return path.join(i.toString(), path.basename(imgPath));
                        }
                        return imgPath;
                    });
                }
                
                // 确保OCR结果包含正确的图片路径引用
                if (content.ocr_results && Array.isArray(content.ocr_results)) {
                    content.ocr_results = content.ocr_results.map(ocr => {
                        if (!ocr.image_path) {
                            ocr.image_path = path.join(i.toString(), `image_${ocr.image_index}.jpg`);
                        } else if (path.isAbsolute(ocr.image_path)) {
                            ocr.image_path = path.join(i.toString(), path.basename(ocr.image_path));
                        }
                        return ocr;
                    });
                }
                
                mergedData.push(content);
            }
        }
        
        // 保存合并后的文件
        const mergedFile = path.join(taskDir, `${taskFolderName}.txt`);
        fs.writeFileSync(mergedFile, JSON.stringify(mergedData, null, 2));
        
        // 导出到指定目录
        if (task.export) {
            const exportDir = typeof task.export === 'string' ? task.export : path.join(__dirname, 'export');
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }
            const exportFile = path.join(exportDir, `${taskFolderName}.md`);
            fs.copyFileSync(mergedFile, exportFile);
        }
        
        return processedCount;
    } catch (error) {
        console.error(`处理小红书关键词任务失败: ${error.message}`);
        return 0;
    }
}

// 主函数
async function main() {
    try {
        const argv = minimist(process.argv.slice(2));
        const inputFile = argv.input || 'weibo_tasks.json';
        // 修改判断逻辑，只有当--visible参数明确设置为true时才启用有头模式
        const visibleMode = argv.visible === true;
        
        const tasksData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const tasks = tasksData.tasks || [];
        
        const browser = await puppeteer.launch({
            headless: !visibleMode, // 默认使用无头模式，只有当--visible=true时才使用有头模式
            args: ['--disable-blink-features=AutomationControlled']
        });
        
        console.log(`浏览器已启动，模式: ${visibleMode ? '可见' : '无头'} (headless=${!visibleMode})`);
        
        for (const task of tasks) {
            if (task.type === 'xhs_keyword') {
                const cookies = JSON.parse(fs.readFileSync('xiaohongshu_cookie.json', 'utf8'));
                const page = await browser.newPage();
                await page.setCookie(...cookies);
                await processXhsKeywordTask(task, browser);
            }
        }
        
        await browser.close();
        console.log('所有任务处理完成');
    } catch (error) {
        console.error('程序执行出错:', error);
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error);