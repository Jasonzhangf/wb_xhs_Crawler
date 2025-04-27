const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const BrowserManager = require('../../utils/browser/browserManager');
const XhsBrowserCore = require('../../utils/browser/xhsBrowserCore');
const BaseContentCapture = require('../../utils/browser/baseContentCapture');
const BaseInteraction = require('../../utils/browser/baseInteraction');
const XhsScrolling = require('../../utils/browser/xhsScrolling');
const OCRProcessor = require('../../utils/ocrProcessor');

// 更新的选择器常量
const IMAGE_ENTRY_SELECTOR = '[data-v-da963056] #image';
const POST_TITLE_LIST_SELECTOR = '[data-v-a264b01a].title';
const POST_DETAIL_TITLE_SELECTOR = '#detail-title'; // 更通用的选择器
const POST_DETAIL_TEXT_SELECTOR = '#detail-desc .note-text'; // 更通用的选择器
const POST_DETAIL_IMAGE_SELECTOR = 'div.swiper-slide img.note-slider-img';
const POST_DETAIL_COMMENT_SELECTOR = '[data-v-aed4aacc] .content';

const MIN_WAIT_TIME = 2000;
const MAX_WAIT_TIME = 4000;

class XhsCrawler {
    constructor(options = {}) {
        this.browser = new BrowserManager();
        this.browser.core = new XhsBrowserCore();
        this.browser.contentCapture = new BaseContentCapture();
        this.browser.interaction = null;
        this.browser.scrolling = null;
        this.visibleMode = options.visibleMode || false;
        this.processedPostUrls = new Set();
        this.noNewContentRetries = 0;
    }

    async randomWait(min = MIN_WAIT_TIME, max = MAX_WAIT_TIME) {
        const waitTime = Math.floor(Math.random() * (max - min) + min);
        console.log(`等待 ${waitTime / 1000} 秒...`);
        await this.browser.wait(waitTime);
    }

    hashUrl(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    async initialize() {
        this.browser.core.visibleMode = this.visibleMode;
        await this.browser.core.initialize();
        this.browser.interaction = new BaseInteraction(this.browser.page);
        this.browser.scrolling = new XhsScrolling(this.browser.page);
        const cookiePath = path.join(process.cwd(), 'xiaohongshu_cookie.json');
        if (fs.existsSync(cookiePath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
            await this.browser.loadCookies(cookies);
            console.log('Cookie 加载成功');
        } else {
            console.warn('Cookie 文件未找到，可能需要登录');
        }
    }

    async mergeJsonFiles(taskDir, keyword, exportPath) {
        try {
            const allContent = [];
            const files = fs.readdirSync(taskDir);
            
            for (const dir of files) {
                const dirPath = path.join(taskDir, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    const contentPath = path.join(dirPath, 'content.json');
                    if (fs.existsSync(contentPath)) {
                        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                        allContent.push(content);
                    }
                }
            }
            
            if (allContent.length > 0) {
                const txtContent = allContent.map(note => {
                    let content = `标题：${note.title || '无标题'}\n`;
                    content += `正文：${note.text || '无内容'}\n`;
                    if (note.comments && note.comments.length > 0) {
                        content += '评论：\n' + note.comments.map(c => `- ${c}`).join('\n') + '\n';
                    }
                    if (note.ocr_texts && note.ocr_texts.length > 0) {
                        content += 'OCR文本：\n' + note.ocr_texts.map(t => `- 图片${t.image_index}: ${t.text}`).join('\n') + '\n';
                    }
                    content += `链接：${note.url || '无链接'}\n`;
                    content += '---\n';
                    return content;
                }).join('\n');
                
                const txtFileName = `${keyword}_${allContent.length}条.txt`;
                const txtPath = path.join(taskDir, txtFileName);
                fs.writeFileSync(txtPath, txtContent, 'utf-8');
                
                const mdContent = allContent.map(note => {
                    let content = `# ${note.title || '无标题'}\n\n`;
                    content += `${note.text || '无内容'}\n\n`;
                    if (note.comments && note.comments.length > 0) {
                        content += '## 评论\n\n' + note.comments.map(c => `* ${c}`).join('\n') + '\n\n';
                    }
                    if (note.ocr_texts && note.ocr_texts.length > 0) {
                        content += '## OCR文本\n\n' + note.ocr_texts.map(t => `* 图片${t.image_index}: ${t.text}`).join('\n') + '\n\n';
                    }
                    content += `[原文链接](${note.url || '#'})\n\n---\n\n`;
                    return content;
                }).join('');
                
                const mdFileName = `${keyword}_${allContent.length}条.md`;
                const mdPath = path.join(taskDir, mdFileName);
                fs.writeFileSync(mdPath, mdContent, 'utf-8');
                
                if (exportPath) {
                    const exportDir = typeof exportPath === 'string' ? exportPath : path.join(process.cwd(), 'export');
                    if (!fs.existsSync(exportDir)) {
                        fs.mkdirSync(exportDir, { recursive: true });
                    }
                    fs.copyFileSync(mdPath, path.join(exportDir, mdFileName));
                    fs.copyFileSync(txtPath, path.join(exportDir, txtFileName));
                }
                
                console.log(`已合并 ${allContent.length} 个笔记到：\n- ${txtPath}\n- ${mdPath}`);
                return allContent.length;
            }
            console.log('没有找到可合并的笔记内容');
            return 0;
        } catch (error) {
            console.error(`合并文件失败: ${error.message}`);
            return 0;
        }
    }

    async processTask(task) {
        if (task.type !== 'xhs_keyword') {
            console.log(`不支持的任务类型: ${task.type}`);
            return;
        }

        const taskDir = path.join('data', 'xhs', task.keyword);
        this.ensureDir(taskDir);

        try {
            await this.browser.core.navigateToSearchPage(task.keyword);
            await this.randomWait();

            console.log(`尝试查找并点击图片入口: ${IMAGE_ENTRY_SELECTOR}`);
            const imageEntryHandle = await this.browser.page.$(IMAGE_ENTRY_SELECTOR);
            if (!imageEntryHandle) {
                console.error('未能找到图片入口元素，请检查选择器或页面加载状态');
                return;
            }

            const entryClicked = await this.browser.interaction.clickElement(imageEntryHandle, { timeout: 10000 });
            if (!entryClicked) {
                console.error('未能点击图片入口，即使元素已找到');
                return;
            }
            console.log('成功点击图片入口，等待帖子列表加载...');
            await this.randomWait(1000, 3000);

            let processedCount = 0;
            const maxItems = task.max_items || 10;
            const processedInThisScroll = new Set();

            while (processedCount < maxItems) {
                console.log(`开始寻找第 ${processedCount + 1} 至 ${maxItems} 条帖子...`);

                const postTitleHandles = await this.browser.page.$$(POST_TITLE_LIST_SELECTOR);
                console.log(`当前页面找到 ${postTitleHandles.length} 个帖子标题元素`);

                if (postTitleHandles.length === 0 && processedCount === 0) {
                    console.warn('未找到任何帖子标题，请检查选择器或页面是否正确加载');
                    break;
                }

                let foundNewPostInLoop = false;
                let clickedInLoop = 0;

                for (const handle of postTitleHandles) {
                    if (processedCount >= maxItems) break;

                    let postTitleText = '未知标题';
                    let postUrl = null;
                    try {
                        const isVisible = await handle.isIntersectingViewport();
                        postTitleText = await handle.evaluate(el => el.textContent?.trim() || '');
                        const postLinkHandle = await handle.evaluateHandle(el => el.closest('a'));
                        postUrl = postLinkHandle ? await postLinkHandle.evaluate(a => a.href) : this.browser.page.url();
                        const urlHash = this.hashUrl(postUrl || postTitleText);

                        if (!isVisible || processedInThisScroll.has(urlHash) || this.processedPostUrls.has(urlHash)) {
                            continue;
                        }

                        console.log(`尝试点击帖子标题: "${postTitleText}" (${postUrl})`);
                        const clickSuccess = await this.browser.interaction.clickElement(handle, { timeout: 5000 });
                        if (!clickSuccess) {
                            console.warn(`点击帖子标题失败: "${postTitleText}"`);
                            processedInThisScroll.add(urlHash);
                            continue;
                        }
                        clickedInLoop++;
                        foundNewPostInLoop = true;
                        await this.randomWait();

                        try {
                            await this.browser.page.waitForFunction(
                                (titleSelector, textSelector) => {
                                    const titleEl = document.querySelector(titleSelector);
                                    const textEl = document.querySelector(textSelector);
                                    return titleEl && textEl && (titleEl.innerText.trim() !== '' || textEl.innerText.trim() !== '');
                                },
                                { timeout: 10000 }, // 增加超时时间
                                POST_DETAIL_TITLE_SELECTOR,
                                POST_DETAIL_TEXT_SELECTOR
                            );
                            console.log('帖子详情关键元素已加载并包含内容');
                        } catch (waitError) {
                            console.warn(`等待帖子详情元素加载超时或无内容: ${waitError.message}`);
                        }

                        const pageContent = await this.browser.page.evaluate((titleSelector, textSelector, commentSelector) => {
                            const title = document.querySelector(titleSelector)?.innerText?.trim() || '';
                            const text = document.querySelector(textSelector)?.innerText?.trim() || '';
                            const comments = [];
                            document.querySelectorAll(commentSelector).forEach(el => {
                                const commentText = el.innerText?.trim();
                                if (commentText) {
                                    comments.push(commentText);
                                }
                            });
                            return { title, text, comments };
                        }, POST_DETAIL_TITLE_SELECTOR, POST_DETAIL_TEXT_SELECTOR, POST_DETAIL_COMMENT_SELECTOR);

                        const uniqueComments = [...new Set(pageContent.comments)];
                        console.log(`原始评论数: ${pageContent.comments.length}, 去重后评论数: ${uniqueComments.length}`);

                        const detailPageUrl = this.browser.page.url();
                        const content = { 
                            title: pageContent.title,
                            text: pageContent.text,
                            comments: uniqueComments,
                            url: detailPageUrl,
                            images: [],
                            ocr_texts: []
                        };

                        if (!content.title && !content.text) {
                            console.warn(`未能提取到帖子 "${postTitleText}" 的标题或内容，可能页面结构已更改`);
                        } else {
                            console.log(`成功提取帖子 "${content.title || postTitleText}" 的内容`);
                        }

                        const noteDir = this.createNoteDirectory(taskDir, processedCount + 1);

                        // 获取并下载帖子图片
                        const imageUrls = await this.browser.page.evaluate((selector) => {
                            const imgs = Array.from(document.querySelectorAll(selector));
                            return imgs.map(img => img.src).filter(src => src && src.startsWith('http'));
                        }, POST_DETAIL_IMAGE_SELECTOR);

                        if (imageUrls.length > 0) {
                            console.log(`找到 ${imageUrls.length} 张图片`);
                            const seenUrls = new Set();
                            const uniqueImageUrls = imageUrls.filter(url => {
                                if (!seenUrls.has(url)) {
                                    seenUrls.add(url);
                                    return true;
                                }
                                return false;
                            });

                            for (let i = 0; i < uniqueImageUrls.length; i++) {
                                try {
                                    const imgUrl = uniqueImageUrls[i];
                                    const imgPath = path.join(noteDir, `image_${i + 1}.jpg`);
                                    await this.downloadImage(imgUrl, imgPath);
                                    // 存储相对路径，使用正斜杠以确保跨平台兼容性
                                    const relativePath = path.relative(process.cwd(), imgPath).replace(/\\/g, '/');
                                    content.images.push(relativePath);
                                    console.log(`已下载图片: ${imgPath}`);

                                    // 只在noimage为false时进行OCR处理
                                    if (!task.noimage) {
                                        const ocrText = await OCRProcessor.extractTextFromImage(imgPath);
                                        if (ocrText) {
                                            content.ocr_texts.push({
                                                image_index: i + 1,
                                                text: ocrText
                                            });
                                            console.log(`图片 ${i + 1} OCR 完成`);
                                        }
                                    }
                                } catch (error) {
                                    console.error(`处理图片失败: ${error.message}`);
                                }
                            }
                        }

                        // 保存内容到JSON文件
                        fs.writeFileSync(
                            path.join(noteDir, 'content.json'),
                            JSON.stringify(content, null, 2),
                            'utf8'
                        );

                        this.processedPostUrls.add(urlHash);
                        processedInThisScroll.add(urlHash);
                        processedCount++;
                        console.log(`成功处理 ${processedCount}/${maxItems} 条笔记: ${content.title || postTitleText}`);

                        console.log('模拟 ESC 键退出帖子详情...');
                        await this.browser.page.keyboard.press('Escape');
                        await this.randomWait();

                    } catch (error) {
                        console.error(`处理帖子 "${postTitleText}" 时出错: ${error.message}`, error.stack);
                        try {
                            if (this.browser.page.url() !== postUrl) {
                                console.log('尝试通过 ESC 恢复...');
                                await this.browser.page.keyboard.press('Escape');
                                await this.randomWait(1000, 2000);
                            }
                        } catch (recoveryError) {
                            console.error('恢复操作失败:', recoveryError);
                        }
                        const urlHash = this.hashUrl(postUrl || postTitleText);
                        processedInThisScroll.add(urlHash);
                        continue;
                    }
                }

                if (!foundNewPostInLoop || clickedInLoop < postTitleHandles.length) {
                    let allVisibleProcessed = true;
                    const visibleHandles = await this.browser.page.$$(POST_TITLE_LIST_SELECTOR);
                    for (const handle of visibleHandles) {
                        const isVisible = await handle.isIntersectingViewport();
                        if (!isVisible) continue;
                        const postTitleText = await handle.evaluate(el => el.textContent?.trim() || '');
                        const postLinkHandle = await handle.evaluateHandle(el => el.closest('a'));
                        const postUrl = postLinkHandle ? await postLinkHandle.evaluate(a => a.href) : this.browser.page.url();
                        const urlHash = this.hashUrl(postUrl || postTitleText);
                        if (!processedInThisScroll.has(urlHash) && !this.processedPostUrls.has(urlHash)) {
                            allVisibleProcessed = false;
                            break;
                        }
                    }
                    
                    // 检查连续无新内容的次数
                    if (allVisibleProcessed) {
                        this.noNewContentRetries++;
                        console.log(`未发现新内容，等待加载... (${this.noNewContentRetries}/5)`);
                        if (this.noNewContentRetries >= 5) {
                            console.log('连续5次未发现新内容，提前结束任务');
                            break;
                        }
                    } else {
                        this.noNewContentRetries = 0;
                    }

                    if (allVisibleProcessed && visibleHandles.length > 0) {
                        console.log('当前视图内所有帖子已处理或尝试过，准备滚动...');
                        if (!this.browser.scrolling) {
                            console.error('Scrolling 模块未初始化');
                            break;
                        }
                        await this.browser.scrolling.scrollPage();
                        console.log('页面滚动完成');
                        processedInThisScroll.clear();
                        await this.randomWait();
                    } else if (visibleHandles.length === 0) {
                        console.log('未找到更多帖子标题，可能已到达底部');
                        break;
                    } else {
                        console.log('当前视图内仍有未处理的帖子，将重试...');
                        await this.randomWait(1000, 2000);
                    }
                } else {
                    processedInThisScroll.clear();
                    await this.randomWait();
                }
            }

            console.log(`任务完成，共处理 ${processedCount} 条笔记`);

        } catch (error) {
            console.error('处理任务时发生严重错误:', error);
        } finally {
            await this.mergeJsonFiles(taskDir, task.keyword, task.export);
        }
    }

    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    createNoteDirectory(taskDir, noteIndex) {
        const noteDir = path.join(taskDir, `note_${noteIndex}`);
        this.ensureDir(noteDir);
        return noteDir;
    }

    async downloadImage(url, filepath) {
        try {
            // 确保目录存在
            const dirPath = path.dirname(filepath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            return new Promise((resolve, reject) => {
                const file = fs.createWriteStream(filepath);
                https.get(url, { rejectUnauthorized: false }, (response) => {
                    if (response.statusCode !== 200) {
                        file.close(() => reject(new Error(`下载图片失败，状态码: ${response.statusCode}, URL: ${url}`)));
                        fs.unlink(filepath, () => {});
                        return;
                    }
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(err => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }).on('error', (err) => {
                    fs.unlink(filepath, () => {});
                    reject(err);
                });
            });
        } catch (error) {
            console.error(`下载图片失败: ${error.message}`);
            return false;
        }
    }

    async processNoteContent(noteDir, content, downloadImages = true) {
        try {
            fs.writeFileSync(
                path.join(noteDir, 'content.json'),
                JSON.stringify(content, null, 2)
            );

            if (downloadImages) {
                const imageUrls = await this.browser.page.evaluate((selector) => {
                    const imgs = Array.from(document.querySelectorAll(selector));
                    return imgs.map(img => img.src).filter(src => src && src.startsWith('http'));
                }, POST_DETAIL_IMAGE_SELECTOR);
                console.log(`找到 ${imageUrls.length} 张原始图片链接`);

                const seenUrls = new Set();
                const uniqueImageUrls = imageUrls.filter(url => {
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        return true;
                    }
                    return false;
                });
                console.log(`去重后剩余 ${uniqueImageUrls.length} 张图片准备下载`);

                content.images = [];
                content.ocr_texts = [];

                for (let i = 0; i < uniqueImageUrls.length; i++) {
                    try {
                        const imgUrl = uniqueImageUrls[i];
                        const imgPath = path.join(noteDir, `image_${i + 1}.jpg`);
                        await this.downloadImage(imgUrl, imgPath);
                        content.images.push(imgPath);
                        console.log(`已下载图片: ${imgPath}`);

                        try {
                            const ocrText = await OCRProcessor.extractTextFromImage(imgPath);
                            console.log(`图片 ${i + 1} OCR 结果: ${ocrText ? ocrText.substring(0, 50) + '...' : '无文本'}`);
                            content.ocr_texts.push({ image_index: i + 1, text: ocrText });
                        } catch (ocrError) {
                            console.error(`图片 ${i + 1} OCR 处理失败: ${ocrError.message}`);
                            content.ocr_texts.push({ image_index: i + 1, text: `OCR 错误: ${ocrError.message}` });
                        }
                    } catch (imgError) {
                        console.error(`下载或处理图片失败: ${imgUrl}, 错误: ${imgError.message}`);
                    }
                }

                fs.writeFileSync(
                    path.join(noteDir, 'content.json'),
                    JSON.stringify(content, null, 2)
                );
            }

            const markdown = this.generateMarkdown(content);
            fs.writeFileSync(
                path.join(noteDir, 'content.md'),
                markdown,
                'utf8'
            );

        } catch (error) {
            console.error(`处理笔记内容时出错: ${error.message}`);
        }
    }

    generateMarkdown(content) {
        let markdown = `# ${content.title || '无标题'}\n\n`;
        markdown += `${content.text || '无内容'}\n\n`;

        if (content.images && content.images.length > 0) {
            markdown += '## 图片\n\n';
            content.images.forEach((imgPath, i) => {
                // 修正相对路径计算，相对于 Markdown 文件本身
                const mdFilePath = path.join(path.dirname(imgPath), 'content.md');
                const relativePath = path.relative(path.dirname(mdFilePath), imgPath).replace(/\\/g, '/');
                markdown += `![图片${i + 1}](./${relativePath})\n\n`;

                const ocrResult = content.ocr_texts?.find(ocr => ocr.image_index === i + 1);
                if (ocrResult && ocrResult.text && !ocrResult.text.startsWith('OCR 错误')) {
                    // 保留换行符
                    const formattedOcrText = ocrResult.text.replace(/\n/g, '\n'); 
                    markdown += `**图片 ${i + 1} OCR:** \n\n${formattedOcrText}\n\n`;
                } else if (ocrResult) {
                    markdown += `**图片 ${i + 1} OCR:** ${ocrResult.text}\n\n`;
                } else {
                    // 如果没有对应的 OCR 结果，也明确指出
                    markdown += `**图片 ${i + 1} OCR:** 无\n\n`;
                }
            });
        }

        if (content.comments && content.comments.length > 0) {
            markdown += '## 评论\n\n';
            content.comments.forEach((comment, index) => {
                markdown += `${index + 1}. ${comment}\n`;
            });
        }

        if (content.url) {
            markdown += `\n[原文链接](${content.url})\n`;
        }

        return markdown;
    }

    async close() {
        if (this.browser && this.browser.core) {
            await this.browser.core.close();
        }
    }
}

module.exports = XhsCrawler;