const path = require('path');
const fs = require('fs');
const WeiboCrawler = require('./weiboCrawler');
const https = require('https');
const OCRProcessor = require('../../utils/ocrProcessor');

class WeiboUserCrawler extends WeiboCrawler {
    constructor(options = {}) {
        super(options);
        this.processedUrls = new Set();
        this.lastScrollPosition = 0;
        this.lastElementCount = 0;
        this.noImage = options.noImage || false;
    }

    async setupViewport() {
        await this.page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
        });
    }

    extractUserIdFromUrl(url) {
        if (!url) return null;
        const match = url.match(/weibo\.com\/u\/(\d+)/);
        return match ? match[1] : null;
    }

    async downloadImage(url, filePath) {
        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download image: ${response.statusCode}`));
                    return;
                }

                const fileStream = fs.createWriteStream(filePath);
                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(true);
                });

                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => reject(err));
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    async observePage() {
        try {
            const elements = {
                typeA: await this.page.$$('.expand') || [],  // 展开按钮
                typeB: await this.page.$$('.Feed_body_3R0rO') || [],  // 主要微博内容
            };
            const currentElementCount = elements.typeB.length;
            return {
                elements,
                currentElementCount,
                hasNewContent: currentElementCount > this.lastElementCount
            };
        } catch (error) {
            console.error('观察页面元素时出错:', error);
            return { 
                elements: { typeA: [], typeB: [] },
                currentElementCount: 0,
                hasNewContent: false
            };
        }
    }

    async handleTypeAElements(elements) {
        if (!elements || !elements.length) return;
        
        try {
            await this.page.evaluate(() => {
                const textElements = document.querySelectorAll('[class*="detail_wbtext_4CRf9"], [node-type="feed_list_content"], [node-type="feed_list_content_full"]');
                let clickCount = 0;

                textElements.forEach(textEl => {
                    const expandElements = Array.from(textEl.querySelectorAll('*')).filter(el => {
                        const text = el.textContent || el.innerText || '';
                        return text.includes('展开') || text === '...展开' || text.endsWith('...展开');
                    });

                    expandElements.forEach(el => {
                        try {
                            el.click();
                            clickCount++;
                            
                            const parentEl = el.parentElement;
                            if (parentEl) {
                                const nextSibling = el.nextSibling;
                                el.remove();
                                if (nextSibling && nextSibling.nodeType === 3 && nextSibling.textContent.trim() === '...') {
                                    nextSibling.remove();
                                }
                                
                                parentEl.style.display = 'block';
                                parentEl.style.maxHeight = 'none';
                                parentEl.style.overflow = 'visible';
                                
                                const fullContentEl = parentEl.querySelector('[node-type="feed_list_content_full"]');
                                if (fullContentEl) {
                                    fullContentEl.style.display = 'block';
                                    fullContentEl.style.visibility = 'visible';
                                }
                            }
                        } catch (error) {
                            console.log(`处理展开按钮失败: ${error.message}`);
                        }
                    });
                    
                    textEl.style.display = 'block';
                    textEl.style.visibility = 'visible';
                    textEl.style.height = 'auto';
                    textEl.style.maxHeight = 'none';
                    textEl.style.overflow = 'visible';
                });
                
                console.log(`处理了 ${clickCount} 个展开按钮`);
            });
            
            await this.wait(500); // Reduced wait time
        } catch (error) {
            console.log('展开全文操作失败:', error.message);
        }
    }

    async handleTypeBElement(element, taskDir, processedCount) {
        try {
            const post = await this.page.evaluate(el => {
                const contentEl = el.querySelector('.detail_wbtext_4CRf9');
                const timeEl = el.querySelector('a[title^="2025-"]');
                const postLink = el.querySelector('a[href^="https://weibo.com/"]');
                const videoEl = el.querySelector('.wbpv-poster');
                const images = Array.from(el.querySelectorAll('img.picture_focusImg_1z5In')).map(img => {
                    let imgUrl = img.src;
                    if (imgUrl.includes('orj360')) {
                        imgUrl = imgUrl.replace(/\/orj360\//, '/large/');
                    }
                    return imgUrl;
                });

                const videoUrl = videoEl ? videoEl.style.backgroundImage.match(/url\("(.+?)"\)/)?.[1] : null;

                return {
                    text: contentEl ? contentEl.textContent.trim() : '',
                    time: timeEl ? timeEl.getAttribute('title') : '',
                    postUrl: postLink ? postLink.href : '',
                    videoUrl,
                    images: images
                };
            }, element);

            if (!post.text && !post.images.length && !post.videoUrl) return null;
            if (this.processedUrls.has(post.postUrl)) return null;

            const postDir = path.join(taskDir, `post_${processedCount + 1}`);
            fs.mkdirSync(postDir, { recursive: true });

            if (post.images.length > 0) {
                const downloadedImages = [];
                const ocrResults = [];
                for (let i = 0; i < post.images.length; i++) {
                    try {
                        const imgUrl = post.images[i];
                        const imgPath = path.join(postDir, `image_${i + 1}.jpg`);
                        await this.downloadImage(imgUrl, imgPath);
                        downloadedImages.push(path.relative(taskDir, imgPath));

                        // Perform OCR if noImage is false
                        if (!this.noImage) {
                            const ocrText = await OCRProcessor.extractTextFromImage(imgPath);
                            if (ocrText) {
                                ocrResults.push({
                                    image: path.relative(taskDir, imgPath),
                                    text: ocrText
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`下载图片失败: ${error.message}`);
                    }
                }
                post.images = downloadedImages;
                if (!this.noImage && ocrResults.length > 0) {
                    post.ocr_results = ocrResults;
                }
            }

            fs.writeFileSync(
                path.join(postDir, 'content.json'),
                JSON.stringify(post, null, 2)
            );

            this.processedUrls.add(post.postUrl);
            return post;
        } catch (error) {
            console.error('处理微博内容时出错:', error);
            return null;
        }
    }

    async scrollPage() {
        try {
            const currentPosition = await this.page.evaluate(() => {
                const oldPosition = window.pageYOffset;
                window.scrollBy(0, window.innerHeight * 4); // Scroll four times the viewport height
                return window.pageYOffset;
            });

            // Check if we can scroll further
            const canScroll = currentPosition > this.lastScrollPosition;
            this.lastScrollPosition = currentPosition;
            await this.wait(300); // Further reduced wait time
            return canScroll;
        } catch (error) {
            console.error('滚动页面时出错:', error);
            return false;
        }
    }

    async processTask(task) {
        try {
            let userId = task.user_id;
            let isHomePage = false;
            
            if (!userId && task.url) {
                // Normalize URL by adding protocol if missing
                let normalizedUrl = task.url;
                if (!normalizedUrl.startsWith('http')) {
                    normalizedUrl = 'https://' + normalizedUrl;
                }
                
                // Create URL object for easier parsing
                try {
                    const urlObj = new URL(normalizedUrl);
                    // Check for homepage URLs with various formats
                    if (urlObj.hostname.endsWith('weibo.com') && 
                        (urlObj.pathname === '/' || !urlObj.pathname)) {
                        isHomePage = true;
                    } else {
                        userId = this.extractUserIdFromUrl(normalizedUrl);
                    }
                } catch (e) {
                    throw new Error('Invalid URL format');
                }
            }
            
            if (!userId && !isHomePage) {
                throw new Error('未提供用户ID或有效的微博用户URL');
            }

            // Set viewport size
            await this.setupViewport();

            // 访问微博主页并注入cookie
            await this.page.goto('https://weibo.com', { waitUntil: 'networkidle0' });
            await this.loadCookies();

            // 访问用户主页或微博主页
            const userUrl = isHomePage ? 'https://weibo.com/' : `https://weibo.com/u/${userId}`;
            await this.page.goto(userUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            
            // 等待页面加载完成
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    await this.page.waitForSelector('.Feed_body_3R0rO', { 
                        visible: true, 
                        timeout: 20000 
                    });
                    break;
                } catch (error) {
                    console.log(`等待页面加载尝试 ${retryCount + 1}/${maxRetries} 失败`);
                    retryCount++;
                    if (retryCount === maxRetries) {
                        throw new Error('页面加载失败');
                    }
                    await this.wait(3000);
                }
            }
            
            // 获取用户信息
            let userInfo;
            if (isHomePage) {
                userInfo = {
                    name: '微博主页',
                    description: '微博首页Feed流'
                };
            } else {
                userInfo = await this.page.evaluate(() => {
                    const info = {};
                    const nameEl = document.querySelector('.ProfileHeader_name_1KbBs');
                    info.name = nameEl ? nameEl.textContent.trim() : '';
                    const descEl = document.querySelector('.ProfileHeader_desc_3fEww');
                    info.description = descEl ? descEl.textContent.trim() : '';
                    return info;
                });
            }

            // 创建任务目录
            const now = new Date();
            const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
            const taskFolderName = `${userInfo.name || userId}_${dateStr}`;
            const taskDir = path.join(process.cwd(), 'data', taskFolderName);
            fs.mkdirSync(taskDir, { recursive: true });

            // 处理历史记录
            const historyFile = path.join(taskDir, 'history.json');
            if (fs.existsSync(historyFile)) {
                const history = JSON.parse(fs.readFileSync(historyFile));
                if (Array.isArray(history.urls)) {
                    // Verify each URL's folder exists
                    history.urls = history.urls.filter(url => {
                        const postId = url.match(/\/\d+\/([A-Za-z0-9]+)/)?.[1];
                        if (!postId) return false;
                        const possibleDirs = fs.readdirSync(taskDir)
                            .filter(dir => dir.startsWith('post_'))
                            .map(dir => path.join(taskDir, dir));
                        return possibleDirs.some(dir => {
                            try {
                                const content = JSON.parse(fs.readFileSync(path.join(dir, 'content.json')));
                                return content.postUrl === url;
                            } catch {
                                return false;
                            }
                        });
                    });
                    history.urls.forEach(url => this.processedUrls.add(url));
                    // Save cleaned history
                    fs.writeFileSync(historyFile, JSON.stringify({ urls: history.urls }, null, 2));
                }
            }

            let processedCount = 0;
            const maxItems = task.max_items || this.maxItems;
            const posts = [];
            let noNewContentRetries = 0;
            const maxNoNewContentRetries = 5;

            while (processedCount < maxItems && noNewContentRetries < maxNoNewContentRetries) {
                const pageState = await this.observePage();
                
                // 处理Type A元素（展开按钮）
                await this.handleTypeAElements(pageState.elements.typeA);
                await this.wait(300); // Further reduced wait time

                // 处理Type B元素（主要内容）
                for (const element of pageState.elements.typeB) {
                    if (processedCount >= maxItems) break;

                    const post = await this.handleTypeBElement(element, taskDir, processedCount);
                    if (post) {
                        posts.push(post);
                        processedCount++;
                    }
                }

                // 更新元素计数并检查是否有新内容
                if (!pageState.hasNewContent) {
                    noNewContentRetries++;
                    console.log(`未找到新内容，等待加载... (${noNewContentRetries}/${maxNoNewContentRetries})`);
                    await this.wait(2000); // Reduced wait time
                } else {
                    noNewContentRetries = 0;
                }
                this.lastElementCount = pageState.currentElementCount;

                // 尝试滚动加载更多内容
                const canScroll = await this.scrollPage();
                if (!canScroll && !pageState.hasNewContent) {
                    console.log('已到达页面底部且无新内容');
                    if (noNewContentRetries >= maxNoNewContentRetries) {
                        console.log('达到最大重试次数，停止爬取');
                        break;
                    }
                }
            }

            // 保存用户信息和所有微博
            const finalData = {
                user_info: userInfo,
                posts: posts
            };

            fs.writeFileSync(
                path.join(taskDir, 'user_data.json'),
                JSON.stringify(finalData, null, 2)
            );

            // 更新历史记录
            fs.writeFileSync(
                historyFile,
                JSON.stringify({
                    urls: Array.from(this.processedUrls)
                }, null, 2)
            );

            console.log(`成功抓取用户 ${userInfo.name || userId} 的 ${processedCount} 条微博`);

            // 合并内容并处理导出
            const mergedFile = path.join(taskDir, `${taskFolderName}.txt`);
            fs.writeFileSync(mergedFile, JSON.stringify(posts, null, 2));

            // 导出到指定目录
            if (task.export) {
                const exportDir = typeof task.export === 'string' ? task.export : path.join(process.cwd(), 'export');
                if (!fs.existsSync(exportDir)) {
                    fs.mkdirSync(exportDir, { recursive: true });
                }
                const exportFile = path.join(exportDir, `${taskFolderName}.md`);
                fs.copyFileSync(mergedFile, exportFile);
            }

        } catch (error) {
            console.error('处理用户任务失败:', error);
            throw error;
        }
    }
}

module.exports = WeiboUserCrawler;