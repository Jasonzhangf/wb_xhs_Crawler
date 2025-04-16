/**
 * 微博爬虫模块
 * 继承自通用爬虫核心，实现微博特定的爬取逻辑
 */
const path = require('path');
const fs = require('fs');
const Crawler = require('../crawler');

class WeiboCrawler extends Crawler {
    constructor(options = {}) {
        super({
            dataDir: 'data',
            maxItems: 20,
            noImage: false,
            ...options
        });
        
        // 微博特定配置
        this.cookiePath = options.cookiePath || path.join(process.cwd(), 'weibo_cookie.json');
        this.browser = null;
        this.fileSystem = null;
    }

    /**
     * 初始化微博爬虫
     */
    async initialize() {
        await super.initialize();
        
        // 动态导入微博相关模块
        try {
            this.browser = require('../../utils/weiboBrowser');
            this.fileSystem = require('../../utils/weiboFileSystem');
        } catch (error) {
            throw new Error(`加载微博模块失败: ${error.message}`);
        }
    }

    /**
     * 处理微博用户任务
     * @param {Object} task - 任务配置
     */
    async processUserTask(task) {
        console.log(`正在访问用户主页: ${task.url}`);
        
        // 直接访问用户主页URL
        await this.browser.navigateToPage(task.url);
        await this.browser.waitForPageStable();
        
        // 获取用户名作为文件夹名
        const userId = task.url.split('/').pop();
        const outputDir = path.join(this.outputDir, `weibo_user_${userId}_${this.getCurrentTimestamp()}`);
        
        // 创建输出目录
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // 获取用户微博内容
        const posts = await this.browser.captureUserPosts(task.max_items);
        
        // 保存爬取结果
        if (posts.length > 0) {
            const outputFile = path.join(outputDir, 'posts.json');
            fs.writeFileSync(outputFile, JSON.stringify(posts, null, 2));
            console.log(`已保存${posts.length}条微博到: ${outputFile}`);
        } else {
            console.log('未获取到任何微博内容');
            fs.rmdirSync(outputDir);
        }
    }

    /**
     * 处理微博关键词任务
     * @param {Object} task - 任务配置
     */
    async processKeywordTask(task) {
        try {
            // 确保关键字存在并正确设置
            const keyword = task.keyword || "未知关键字";
            console.log(`使用的关键字: ${keyword}`);
            
            // 设置任务参数
            const maxItems = task.max_items || this.options.maxItems;
            const noImage = task.noimage || this.options.noImage;
            
            // 创建任务目录
            const taskDir = this.createTaskDir(keyword, maxItems);
            
            // 加载历史记录
            let history = this.fileSystem.loadHistory(taskDir);
            history = history.filter(item => fs.existsSync(item.folderPath));
            
            // 获取当前最大序号
            let maxSeq = 0;
            const folders = fs.readdirSync(taskDir);
            for (const folder of folders) {
                const match = folder.match(/^(\d+)$/);
                if (match && fs.statSync(path.join(taskDir, folder)).isDirectory()) {
                    const seq = parseInt(match[1]);
                    if (seq > maxSeq) maxSeq = seq;
                }
            }
            
            // 构建搜索URL
            console.log(`构建URL使用的关键字: ${keyword}`);
            console.log(`编码后的关键字: ${encodeURIComponent(keyword)}`);
            let searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&scope=ori&suball=1`;
            
            // 添加日期范围
            if (task.start_date && task.end_date) {
                searchUrl += `&timescope=custom:${task.start_date}:${task.end_date}`;
            } else {
                const { startDate, endDate } = this.getDateRange(7);
                searchUrl += `&timescope=custom:${startDate}:${endDate}`;
            }
            searchUrl += '&Refer=g&page=1';
            
            // 导航到搜索页面
            await this.browser.navigateToPage(searchUrl);
            await this.wait(3000);
            
            // 处理搜索结果
            let processedCount = 0;
            let currentSeq = maxSeq;
            let currentPage = 1;
            let hasNextPage = true;
            
            while (processedCount < maxItems && hasNextPage) {
                // 展开所有内容
                await this.browser.clickExpandButtons();
                await this.wait(1000);
                
                // 获取微博内容
                const feedElements = await this.browser.page.evaluate(() => {
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
                
                // 处理每条微博
                for (const feed of feedElements) {
                    if (processedCount >= maxItems) break;
                    
                    if (feed.postUrl && history.some(item => item.url === feed.postUrl)) {
                        console.log(`跳过已处理的URL: ${feed.postUrl}`);
                        continue;
                    }
                    
                    currentSeq++;
                    const postDir = path.join(taskDir, currentSeq.toString());
                    this.fileSystem.ensureDir(postDir);
                    
                    const content = {
                        text: feed.text,
                        publishTime: feed.publishTime,
                        postUrl: feed.postUrl,
                        images: [],
                        ocr_results: [],
                        comments: []
                    };
                    
                    // 处理评论
                    if (task.comment && feed.hasCommentBtn) {
                        try {
                            const commentBtnClicked = await this.browser.page.evaluate((postUrl) => {
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
                                await this.wait(1000);
                                
                                const comments = await this.browser.page.evaluate(() => {
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
                    
                    // 处理图片
                    if (!noImage) {
                        for (let i = 0; i < feed.imgUrls.length; i++) {
                            try {
                                const imgUrl = feed.imgUrls[i];
                                const imgPath = path.join(postDir, `image_${i+1}.jpg`);
                                await this.fileSystem.downloadImage(imgUrl, imgPath);
                                content.images.push(imgPath);
                                
                                // OCR处理
                                try {
                                    const ocrProcessor = require('../../utils/ocrProcessor');
                                    const ocrResult = await ocrProcessor.extractTextFromImage(imgPath);
                                    if (ocrResult) {
                                        content.ocr_results.push(ocrResult);
                                    }
                                } catch (ocrError) {
                                    console.error(`OCR处理失败: ${ocrError.message}`);
                                }
                            } catch (imgError) {
                                console.error(`下载图片失败: ${imgError.message}`);
                            }
                        }
                    }
                    
                    // 保存内容
                    const contentFile = path.join(postDir, 'content.json');
                    fs.writeFileSync(contentFile, JSON.stringify(content, null, 2));
                    
                    // 更新历史记录
                    this.fileSystem.addToHistory(feed.postUrl, postDir, taskDir);
                    history = this.fileSystem.loadHistory(taskDir);
                    
                    processedCount++;
                    console.log(`已处理 ${processedCount}/${maxItems} 条微博`);
                }
                
                // 翻页处理
                if (processedCount < maxItems) {
                    currentPage++;
                    const nextPageUrl = searchUrl.replace(/&page=\d+/, `&page=${currentPage}`);
                    await this.browser.navigateToPage(nextPageUrl);
                    await this.wait(3000);
                    
                    const hasContent = await this.browser.page.evaluate(() => {
                        return document.querySelectorAll('.card-feed').length > 0;
                    });
                    
                    if (!hasContent) {
                        hasNextPage = false;
                    }
                } else {
                    hasNextPage = false;
                }
            }
            
            // 合并数据
            const mergedData = [];
            for (const item of history) {
                try {
                    const contentFile = path.join(item.folderPath, 'content.json');
                    if (fs.existsSync(contentFile)) {
                        const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
                        mergedData.push(content);
                    }
                } catch (e) {
                    console.error(`读取内容文件失败: ${e.message}`);
                }
            }
            
            // 保存合并文件
            const taskFolderName = path.basename(taskDir);
            const mergedFile = path.join(taskDir, `${taskFolderName}.txt`);
            fs.writeFileSync(mergedFile, JSON.stringify(mergedData, null, 2));
            
            // 导出处理
            if (task.export) {
                const exportDir = typeof task.export === 'string' ? task.export : path.join(process.cwd(), 'export');
                this.ensureDir(exportDir);
                const exportFile = path.join(exportDir, `${taskFolderName}.md`);
                fs.copyFileSync(mergedFile, exportFile);
            }
            
            return processedCount;
        } catch (error) {
            console.error(`处理微博关键词任务失败: ${error.message}`);
            return 0;
        }
    }

    /**
     * 等待指定时间
     * @param {number} ms - 毫秒数
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 处理任务
     * @param {Object} task - 任务配置
     */
    async processTask(task) {
        try {
            // 初始化浏览器
            await this.browser.initialize(this.visibleMode);
            
            // 加载Cookie
            const cookies = JSON.parse(fs.readFileSync(this.cookiePath, 'utf8'));
            await this.browser.loadCookies(cookies);
            
            // 根据任务类型处理
            if (task.type === 'wb_user') {
                console.log(`准备处理用户任务: ${task.url}`);
                await this.processUserTask(task);
            } else if (task.type === 'wb_keyword') {
                console.log(`准备处理关键字任务: ${task.keyword}`);
                await this.processKeywordTask(task);
            } else {
                console.log(`未知任务类型: ${task.type}`);
            }
            
            // 关闭浏览器
            await this.browser.close();
        } catch (error) {
            console.error(`处理任务失败: ${error.message}`);
            if (this.browser) {
                await this.browser.close().catch(() => {});
            }
        }
    }
}

module.exports = WeiboCrawler;