const path = require('path');
const fs = require('fs');
const minimist = require('minimist');
const weiboConfig = require('./utils/weiboConfig');
const WeiboFileSystem = require('./utils/weiboFileSystem');
const path = require('path');
const weiboBrowser = require('./utils/weiboBrowser');
const ocrProcessor = require('./utils/ocrProcessor');

// 动态加载小红书相关模块
let xhsBrowser, xhsFileSystem;
try {
    xhsBrowser = require('./utils/xhsBrowser');
    const XhsFileSystem = require('./utils/xhsFileSystem');
    xhsFileSystem = new XhsFileSystem();
} catch (error) {
    console.error(`加载小红书模块时出错: ${error.message}`);
    process.exit(1);
}

// 处理微博关键词搜索任务
async function processWeiboKeywordTask(task, weiboFS) {
    try {
        // 确保关键字存在并正确设置
        const keywordToUse = task.keyword || "未知关键字";
        console.log(`使用的关键字: ${keywordToUse}`);
        weiboConfig.KEYWORD = keywordToUse; // 更新配置中的关键字
        weiboConfig.MAX_ITEMS = task.max_items || 20;
        weiboConfig.NO_IMAGE = task.noimage || false;
        
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const maxItems = task.max_items || weiboConfig.MAX_ITEMS;
        const taskFolderName = `keyword_${keywordToUse}_${dateStr}_${maxItems}`;
        const taskDir = path.join(__dirname, 'data', 'weibo', taskFolderName);
        weiboFS.ensureDir(taskDir);
        
        // 初始化历史记录文件
        const historyFile = path.join(taskDir, 'history.json');
        let history = [];
        if (fs.existsSync(historyFile)) {
            try {
                history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                // 验证历史记录中的文件夹和JSON文件是否存在
                history = history.filter(item => {
                    const contentFile = path.join(item.folderPath, 'content.json');
                    return fs.existsSync(item.folderPath) && fs.existsSync(contentFile) &&
                           fs.statSync(contentFile).size > 0;
                });
            } catch (error) {
                console.error(`读取历史记录失败: ${error.message}`);
                history = [];
            }
        }
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
        
        // 确保历史记录保存在任务文件夹下，而不是项目根目录
        // 使用WeiboFileSystem类的方法加载特定任务的历史记录
        let history = weiboFS.loadHistory(taskDir);
        // 过滤掉不存在的文件夹路径
        history = history.filter(item => fs.existsSync(item.folderPath));
        
        let maxSeq = 0;
        const folders = fs.readdirSync(taskDir);
        for (const folder of folders) {
            const match = folder.match(/^(\d+)$/);
            if (match && fs.statSync(path.join(taskDir, folder)).isDirectory()) {
                const seq = parseInt(match[1]);
                if (seq > maxSeq) maxSeq = seq;
            }
        }
        
        // 打印关键字和编码后的关键字，用于调试
        console.log(`构建URL使用的关键字: ${keywordToUse}`); 
        console.log(`编码后的关键字: ${encodeURIComponent(keywordToUse)}`); 
        let searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keywordToUse)}&scope=ori&suball=1`;
        if (task.start_date && task.end_date) {
            searchUrl += `&timescope=custom:${task.start_date}:${task.end_date}`;
        } else {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 7);
            const formatDate = (date) => {
                return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
            };
            searchUrl += `&timescope=custom:${formatDate(startDate)}:${formatDate(endDate)}`;
        }
        searchUrl += '&Refer=g&page=1';
        
        await weiboBrowser.navigateToPage(searchUrl);
        await weiboBrowser.wait(3000);
        
        let processedCount = 0;
        let currentSeq = maxSeq;
        let currentPage = 1;
        let hasNextPage = true;
        
        while (processedCount < weiboConfig.MAX_ITEMS && hasNextPage) {
            await weiboBrowser.clickExpandButtons();
            await weiboBrowser.wait(1000);
            
            const feedElements = await weiboBrowser.page.evaluate(() => {
                const feeds = Array.from(document.querySelectorAll('.card-feed'));
                return feeds.map(feed => {
                    const contentElement = feed.querySelector('[node-type="feed_list_content"]') || 
                                         feed.querySelector('[node-type="feed_list_content_full"]');
                    const text = contentElement ? contentElement.textContent.trim() : '';
                    
                    const timeElement = feed.querySelector('.from a[target="_blank"]');
                    const publishTime = timeElement ? timeElement.textContent.trim() : '';
                    const postUrl = timeElement ? timeElement.href : '';
                    
                    const imgElements = feed.querySelectorAll('[node-type="fl_pic_list"] img');
                    const imgUrls = Array.from(imgElements).map(img => {
                        let imgUrl = img.src;
                        if (imgUrl.includes('thumbnail') || imgUrl.includes('thumb150') || imgUrl.includes('orj360')) {
                            imgUrl = imgUrl.replace(/\/thumb150\/|\/orj360\/|\/thumbnail\//, '/large/');
                        }
                        return imgUrl;
                    });
                    
                    const commentBtn = feed.querySelector('[action-type="feed_list_comment"]');
                    const hasCommentBtn = commentBtn !== null;
                    
                    return {
                        text,
                        publishTime,
                        postUrl,
                        imgUrls,
                        hasCommentBtn
                    };
                });
            });
            
            for (const feed of feedElements) {
                if (processedCount >= weiboConfig.MAX_ITEMS) break;
                
                if (feed.postUrl && history.some(item => item.url === feed.postUrl)) {
                    console.log(`跳过已处理的URL: ${feed.postUrl}`);
                    continue;
                }
                
                // 检查是否有内容需要保存
                if (!feed.text && feed.imgUrls.length === 0 && (!task.comment || feed.comments.length === 0)) {
                    console.log('跳过空内容');
                    continue;
                }
                
                currentSeq++;
                const postDir = path.join(taskDir, currentSeq.toString());
                weiboFS.ensureDir(postDir);
                
                const content = {
                    text: feed.text,
                    publishTime: feed.publishTime,
                    postUrl: feed.postUrl,
                    images: [],
                    ocr_results: [],
                    comments: []
                };
                
                if (task.comment && feed.hasCommentBtn) {
                    try {
                        const commentBtnClicked = await weiboBrowser.page.evaluate((postUrl) => {
                            const feeds = Array.from(document.querySelectorAll('.card-feed'));
                            for (const feed of feeds) {
                                const linkEl = feed.querySelector(`a[href="${postUrl}"]`) || 
                                             feed.querySelector(`a[href*="${postUrl.split('/').pop()}"]`);
                                if (linkEl) {
                                    const commentBtn = feed.querySelector('[action-type="feed_list_comment"]');
                                    if (commentBtn) {
                                        commentBtn.click();
                                        return true;
                                    }
                                }
                            }
                            return false;
                        }, feed.postUrl);
                        
                        if (commentBtnClicked) {
                            await weiboBrowser.wait(1000);
                            
                            const comments = await weiboBrowser.page.evaluate(() => {
                                const commentElements = document.querySelectorAll('[node-type="feed_list_repeat"] .card-review');
                                return Array.from(commentElements).map(comment => {
                                    const userEl = comment.querySelector('.name');
                                    const contentEl = comment.querySelector('.WB_text');
                                    return {
                                        user: userEl ? userEl.textContent.trim() : '',
                                        content: contentEl ? contentEl.textContent.trim() : ''
                                    };
                                });
                            });
                            
                            content.comments = comments;
                        }
                    } catch (commentError) {
                        console.error(`获取评论失败: ${commentError.message}`);
                    }
                }
                
                if (!weiboConfig.NO_IMAGE) {
                    for (let i = 0; i < feed.imgUrls.length; i++) {
                        try {
                            const imgUrl = feed.imgUrls[i];
                            // 检查URL是否为视频
                            if (imgUrl.includes('video') || imgUrl.endsWith('.mp4')) {
                                console.log(`跳过视频文件: ${imgUrl}`);
                                continue;
                            }
                            const imgPath = path.join(postDir, `image_${i+1}.jpg`);
                            await weiboFS.downloadImage(imgUrl, imgPath);
                            content.images.push(imgPath);
                            
                            if (ocrProcessor) {
                                try {
                                    const ocrResult = await ocrProcessor.extractTextFromImage(imgPath);
                                    if (ocrResult) {
                                        content.ocr_results.push(ocrResult);
                                    }
                                } catch (ocrError) {
                                    console.error(`OCR处理失败: ${ocrError.message}`);
                                }
                            }
                        } catch (imgError) {
                            console.error(`下载图片失败: ${imgError.message}`);
                        }
                    }
                }
                
                const contentFile = path.join(postDir, 'content.json');
                fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
                
                // 只将历史记录保存在任务文件夹下
                // 使用WeiboFileSystem类的方法添加到历史记录并保存
                weiboFS.addToHistory(feed.postUrl, postDir, taskDir);
                // 重新加载更新后的历史记录
                history = weiboFS.loadHistory(taskDir);
                
                processedCount++;
                console.log(`已处理 ${processedCount}/${weiboConfig.MAX_ITEMS} 条微博`);
            }
            
            if (processedCount < weiboConfig.MAX_ITEMS) {
                currentPage++;
                const nextPageUrl = searchUrl.replace(/&page=\d+/, `&page=${currentPage}`);
                await weiboBrowser.navigateToPage(nextPageUrl);
                await weiboBrowser.wait(3000);
                
                const hasContent = await weiboBrowser.page.evaluate(() => {
                    return document.querySelectorAll('.card-feed').length > 0;
                });
                
                if (!hasContent) {
                    hasNextPage = false;
                }
            } else {
                hasNextPage = false;
            }
        }
        
        // 合并所有内容到一个文件
        const mergedData = [];
        const urlOnlyData = [];
        for (const item of history) {
            try {
                const contentFile = path.join(item.folderPath, 'content.json');
                if (fs.existsSync(contentFile)) {
                    const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
                    mergedData.push(content);
                    // 只收集URL信息
                    if (content.postUrl) {
                        urlOnlyData.push({
                            url: content.postUrl,
                            publishTime: content.publishTime || '',
                            folderPath: item.folderPath
                        });
                    }
                }
            } catch (e) {
                console.error(`读取内容文件失败: ${e.message}`);
            }
        }
        
        // 保存完整内容文件
        const mergedFile = path.join(taskDir, `${taskFolderName}_full.json`);
        fs.writeFileSync(mergedFile, JSON.stringify(mergedData, null, 2));
        
        // 保存仅URL的文件
        const urlOnlyFile = path.join(taskDir, `${taskFolderName}_urls.json`);
        fs.writeFileSync(urlOnlyFile, JSON.stringify(urlOnlyData, null, 2));
        
        // 更新历史记录
        fs.writeFileSync(historyFile, JSON.stringify(urlOnlyData, null, 2));
        
        if (task.export) {
            const exportDir = typeof task.export === 'string' ? task.export : path.join(__dirname, 'export');
            weiboFS.ensureDir(exportDir);
            const exportFile = path.join(exportDir, `${taskFolderName}.md`);
            fs.copyFileSync(mergedFile, exportFile);
        }
        
        return processedCount;
    } catch (error) {
        console.error(`处理微博关键词任务失败: ${error.message}`);
        return 0;
    }
}

// 处理小红书关键词搜索任务
async function processXhsKeywordTask(task, xhsFS) {
    try {
        const keyword = task.keyword;
        const maxItems = task.max_items || 20;
        const noImage = task.noimage || false;
        
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const taskFolderName = `${keyword}_${dateStr}_${maxItems}条`;
        const taskDir = path.join(__dirname, 'data', taskFolderName);
        xhsFS.ensureDir(taskDir);
        
        // 加载历史记录并验证文件夹是否存在
        let history = xhsFS.loadHistory(taskDir);
        // 获取当前目录下的最大笔记序号
        let noteIndex = xhsFS.getMaxNoteIndex(taskDir) + 1;
        
        await xhsBrowser.navigateToSearchPage(keyword);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        let processedCount = 0;
        
        while (processedCount < maxItems) {
            const elements = await xhsBrowser.getVisibleElements();
            
            if (elements.length === 0) {
                await xhsBrowser.autoScroll();
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            
            for (const element of elements) {
                if (processedCount >= maxItems) break;
                
                // 使用任务文件夹下的历史记录检查URL是否已访问
                if (xhsFS.isUrlVisited(element.text, taskDir)) continue;
                
                const clicked = await xhsBrowser.findAndClickElement(element);
                if (!clicked) continue;
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const pageContent = await xhsBrowser.getPageContent();
                const images = noImage ? [] : await xhsBrowser.getPostImages();
                
                const noteDir = xhsFS.createNoteDirectory(taskDir, noteIndex);
                const content = {
                    content: pageContent,
                    images: [],
                    ocr_results: []
                };
                
                if (!noImage) {
                    for (let i = 0; i < images.length; i++) {
                        try {
                            const imgPath = path.join(noteDir, `image_${i+1}.jpg`);
                            await xhsFS.downloadImage(images[i], imgPath);
                            content.images.push(imgPath);
                            
                            if (ocrProcessor) {
                                try {
                                    const ocrResult = await ocrProcessor.extractTextFromImage(imgPath);
                                    if (ocrResult) {
                                        content.ocr_results.push(ocrResult);
                                    }
                                } catch (ocrError) {
                                    console.error(`OCR处理失败: ${ocrError.message}`);
                                }
                            }
                        } catch (imgError) {
                            console.error(`下载图片失败: ${imgError.message}`);
                        }
                    }
                }
                
                xhsFS.saveNoteContent(noteDir, content);
                // 将访问记录保存在任务文件夹下
                xhsFS.addToHistory(element.text, noteDir, taskDir);
                
                processedCount++;
                noteIndex++;
                
                console.log(`已处理 ${processedCount}/${maxItems} 条笔记`);
                await xhsBrowser.navigateToSearchPage(keyword);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
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
        const argv = require('minimist')(process.argv.slice(2));
        const inputFile = argv.input || 'weibo_tasks.json';
        const visibleMode = argv.visible !== undefined;
        
        const tasksData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
        const tasks = tasksData.tasks || [];
        
        for (const task of tasks) {
            if (task.type === 'wb_user') {
                await weiboBrowser.initialize(visibleMode);
                const weiboCookies = JSON.parse(fs.readFileSync('weibo_cookie.json', 'utf8'));
                await weiboBrowser.loadCookies(weiboCookies);
                await processWeiboKeywordTask({...task, platform: 'weibo'}, WeiboFileSystem);
                await weiboBrowser.close();
            } else if (task.type === 'wb_keyword') {
                await weiboBrowser.initialize(visibleMode);
                const weiboCookies = JSON.parse(fs.readFileSync('weibo_cookie.json', 'utf8'));                await weiboBrowser.loadCookies(weiboCookies);
                // 确保关键字正确传递
                console.log(`准备处理关键字任务: ${task.keyword}`);
                await processWeiboKeywordTask({
                    ...task, 
                    platform: 'weibo',
                    keyword: task.keyword // 确保关键字被正确传递
                }, WeiboFileSystem);
                await weiboBrowser.close();
            }
        }
        
        console.log('所有任务处理完成');
    } catch (error) {
        console.error('程序执行出错:', error);
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error);