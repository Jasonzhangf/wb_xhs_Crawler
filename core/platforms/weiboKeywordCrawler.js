const WeiboCrawler = require('./weiboCrawler');
const fs = require('fs');
const path = require('path');
const TaskManager = require('../../utils/taskManager');

class WeiboKeywordCrawler extends WeiboCrawler {
    constructor(options = {}) {
        super(options);
        this.noImage = options.noImage || false;
        this.taskManager = new TaskManager();
    }

    async processTask(task) {
        try {
            this.noImage = task.noimage !== undefined ? task.noimage : this.noImage;
            
            const keyword = task.keyword;
            if (!keyword) {
                throw new Error('未提供搜索关键词');
            }

            // 生成并创建任务目录
            const taskFolderName = this.taskManager.generateTaskFolderName('weibo', task);
            
            // 检查任务是否已存在
            if (this.taskManager.checkTaskExists('weibo', taskFolderName)) {
                console.log(`任务 ${taskFolderName} 已存在，验证历史记录...`);
                const taskDir = path.join(process.cwd(), 'data', 'weibo', taskFolderName);
                const history = this.taskManager.verifyHistory(taskDir);
                this.processedUrls = new Set(history.urls);
                //return;
            }
            
            const taskDir = this.taskManager.createTaskDirectory('weibo', taskFolderName);

            // 构建搜索URL，使用最近3天的时间范围
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 3);
            const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&typeall=1&suball=1&timescope=custom:${formatDate(startDate)}:${formatDate(endDate)}&Refer=g&page=1`;
            await this.page.goto(searchUrl);
            await this.wait(3000);

            let processedCount = 0;
            const posts = [];

            let pageNum = 1;
            let lastPostCount = 0;
            let noNewPosts = 0;

            const maxItems = task.max_items || 20; // 使用任务配置的max_items或默认值20
            while (processedCount < maxItems) {
                console.log(`Processing page ${pageNum}, collected ${processedCount}/${maxItems} posts`);
                
                // 展开所有内容
                await this.page.evaluate(() => {
                    const expandBtns = document.querySelectorAll('[action-type="fl_unfold"]');
                    expandBtns.forEach(btn => btn.click());
                });
                await this.wait(2000); // Increased wait time

                // 获取微博内容
                const newPosts = await this.page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.card-feed')).map(feed => {
                        const contentEl = feed.querySelector('[node-type="feed_list_content_full"]') ||
                                        feed.querySelector('[node-type="feed_list_content"]');
                        const text = contentEl ? contentEl.textContent.trim() : '';
                        const timeEl = feed.querySelector('.from a[target="_blank"]');
                        const time = timeEl ? timeEl.textContent.trim() : '';
                        const postUrl = timeEl ? timeEl.href : '';
                        const images = Array.from(feed.querySelectorAll('[node-type="fl_pic_list"] img')).map(img => {
                            let imgUrl = img.src;
                            if (imgUrl.includes('thumbnail') || imgUrl.includes('thumb150') || imgUrl.includes('orj360')) {
                                imgUrl = imgUrl.replace(/\/thumb150\/|\/orj360\/|\/thumbnail\//, '/large/');
                            }
                            return imgUrl;
                        });
                        return { text, time, postUrl, images };
                    });
                });

                // 检查是否获取到新的帖子
                if (newPosts.length === lastPostCount) {
                    noNewPosts++;
                    console.log(`未发现新内容，等待加载... (${noNewPosts}/5)`);
                    if (noNewPosts >= 5) {
                        console.log('连续5次未发现新内容，提前结束任务');
                        break;
                    }
                } else {
                    noNewPosts = 0;
                    lastPostCount = newPosts.length;
                }

                for (const post of newPosts) {
                    if (processedCount >= maxItems) break;

                    // 保存微博内容
                    const nextIndex = this.taskManager.getNextFolderIndex(taskDir);
                    const postDir = path.join(taskDir, `post_${nextIndex}`);
                    if (!fs.existsSync(postDir)) {
                        fs.mkdirSync(postDir);
                    }

                    // 保存页面HTML源代码
                    const html = await this.page.content();
                    fs.writeFileSync(path.join(postDir, 'source.html'), html);

                    // 处理图片和OCR
                    await this.processImages(post, postDir, taskDir);

                    // 保存微博数据
                    fs.writeFileSync(
                        path.join(postDir, 'content.json'),
                        JSON.stringify(post, null, 2)
                    );

                    posts.push(post);
                    processedCount++;
                }

                pageNum++;
                // 直接通过URL访问下一页
                const nextPageUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&typeall=1&suball=1&timescope=custom:${formatDate(startDate)}:${formatDate(endDate)}&Refer=g&page=${pageNum}`;
                const response = await this.page.goto(nextPageUrl);
                
                // 检查页面是否存在
                if (!response || response.status() === 404) {
                    console.log('No more pages available');
                    break;
                }
                
                await this.wait(3000); // Wait for page load
            }

            // 合并所有微博数据
            const allPosts = this.taskManager.mergeJsonFiles(taskDir);
            const mergedFile = path.join(taskDir, `${taskFolderName}.txt`);
            fs.writeFileSync(mergedFile, JSON.stringify(allPosts, null, 2));

            // 生成URL合并文件
            const urlOnlyData = posts.map(post => post.postUrl).filter(url => url);
            const urlFile = path.join(taskDir, `${taskFolderName}_urls.txt`);
            fs.writeFileSync(urlFile, JSON.stringify(urlOnlyData, null, 2));

            // 导出到指定目录
            if (task.export) {
                const exportDir = typeof task.export === 'string' ? task.export : path.join(process.cwd(), 'export');
                if (!fs.existsSync(exportDir)) {
                    fs.mkdirSync(exportDir, { recursive: true });
                }
                const exportFile = path.join(exportDir, `${taskFolderName}.md`);
                fs.copyFileSync(mergedFile, exportFile);
            }

            console.log(`成功抓取关键词 ${keyword} 的 ${processedCount} 条微博`);
        } catch (error) {
            console.error('处理关键词任务失败:', error);
            throw error;
        }
    }
}

module.exports = WeiboKeywordCrawler;
