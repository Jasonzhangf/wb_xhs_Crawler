const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const BrowserManager = require('../../utils/browser/browserManager');
const XhsBrowserCore = require('../../utils/browser/xhsBrowserCore');
const BaseContentCapture = require('../../utils/browser/baseContentCapture');
const BaseInteraction = require('../../utils/browser/baseInteraction');
const XhsScrolling = require('../../utils/browser/xhsScrolling');

// Import modular components
const SearchHandler = require('./modules/searchHandler');
const PostProcessor = require('./modules/postProcessor');
const CommentCollector = require('./modules/commentCollector');
const ImageProcessor = require('./modules/imageProcessor');
const FileManager = require('./modules/fileManager');

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
        
        // Initialize modular components
        this.searchHandler = new SearchHandler(this.browser, options);
        this.postProcessor = new PostProcessor(this.browser, options);
        this.commentCollector = new CommentCollector(this.browser, options);
        this.imageProcessor = new ImageProcessor(this.browser, options);
        this.fileManager = new FileManager();
        
        this.noNewContentRetries = 0;
        this.maxNoNewContentRetries = 5;
    }

    async randomWait(min = MIN_WAIT_TIME, max = MAX_WAIT_TIME) {
        const waitTime = Math.floor(Math.random() * (max - min) + min);
        console.log(`等待 ${waitTime / 1000} 秒...`);
        await this.browser.wait(waitTime);
        return waitTime;
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
            console.log('Cookies loaded successfully');
        } else {
            console.warn('Cookie file not found, login may be required');
        }
    }

    async processTask(task) {
        if (task.type !== 'xhs_keyword') {
            console.log(`Unsupported task type: ${task.type}`);
            return;
        }

        const taskDir = path.join('data', 'xhs', task.keyword);
        this.fileManager.ensureDir(taskDir);

        // Initialize search retry counter
        let searchRetryCount = 0;
        const maxSearchRetries = 3;
        let processedCount = 0;
        const maxItems = task.max_items || 10;
        let processedUrls = new Set(); // Track all processed URLs
        
        while (searchRetryCount < maxSearchRetries && processedCount < maxItems) {
            try {
                console.log(`Starting search attempt ${searchRetryCount + 1}/${maxSearchRetries}...`);
                // Handle search page
                const searchSuccess = await this.searchHandler.handleSearch(task, taskDir);
                if (!searchSuccess) {
                    searchRetryCount++;
                    console.log(`Search attempt failed, retrying... (${searchRetryCount}/${maxSearchRetries})`);
                    await this.randomWait(5000, 8000); // Wait longer between search attempts
                    continue;
                }
                
                // Reset retry counter for content loading
                this.noNewContentRetries = 0;

                // Inner loop to process posts until we reach max items or run out of new content
                let innerLoopActive = true;
                while (innerLoopActive && processedCount < maxItems) {
                    console.log(`Looking for posts ${processedCount + 1} to ${maxItems}...`);

                    // First scroll to load more content
                    if (this.browser.scrolling) {
                        await this.browser.scrolling.scrollPage();
                        // Only wait once after scrolling
                        await this.randomWait(3000, 5000); // Longer wait for content to load
                    }

                    // Get fresh handles after scrolling
                    const { success, handles } = await this.postProcessor.processPostTitles(maxItems, processedCount);
                    if (!success) {
                        this.noNewContentRetries++;
                        if (this.noNewContentRetries >= this.maxNoNewContentRetries) {
                            console.log(`No new content found after ${this.maxNoNewContentRetries} retries, trying new search`);
                            innerLoopActive = false; // Break inner loop to try a new search
                            break;
                        }
                        await this.randomWait(2000, 4000);
                        continue;
                    }

                    let foundNewPostInLoop = false;
                    let clickedInLoop = 0;

                    for (const handle of handles) {
                        if (processedCount >= maxItems) break;

                        try {
                            // 使用PostProcessor模块处理帖子点击和URL提取
                            // 获取帖子标题用于日志记录
                            const postTitleText = await handle.evaluate(el => el.textContent?.trim() || 'unknown');
                            
                            // 使用更可靠的URL提取方法
                            const postUrl = await handle.evaluate(el => {
                                // Try multiple methods to find the URL
                                // 1. Check if element is inside an anchor
                                const anchor = el.closest('a');
                                if (anchor && anchor.href) {
                                    // Convert search result URL to actual post URL
                                    const url = new URL(anchor.href);
                                    if (url.pathname.includes('search_result')) {
                                        // Extract post ID from the element's data attributes or URL parameters
                                        const postId = el.closest('[data-note-id]')?.getAttribute('data-note-id');
                                        if (postId) {
                                            return `https://www.xiaohongshu.com/explore/${postId}`;
                                        }
                                    }
                                    return anchor.href;
                                }
                                
                                // 2. Check for parent anchor
                                let parent = el.parentElement;
                                while (parent) {
                                    if (parent.tagName === 'A' && parent.href) return parent.href;
                                    parent = parent.parentElement;
                                }
                                
                                // 3. Look for nearby anchors
                                const nearbyAnchor = el.parentElement?.querySelector('a');
                                if (nearbyAnchor && nearbyAnchor.href) return nearbyAnchor.href;
                                
                                // 4. Try to find any anchor in the parent container
                                const container = el.closest('[data-v-a264b01a]');
                                if (container) {
                                    const anyAnchor = container.querySelector('a');
                                    if (anyAnchor && anyAnchor.href) return anyAnchor.href;
                                }
                                
                                return '';
                            });
                            
                            // 创建URL哈希用于跟踪已处理的帖子
                            const urlHash = this.hashUrl(postUrl || postTitleText);
                            
                            // 跳过已处理的帖子
                            if (processedUrls.has(urlHash)) {
                                console.log(`已处理过该帖子: ${postTitleText}`);
                                continue;
                            }
                            
                            // 确保元素在视口内
                            const isVisible = await handle.isIntersectingViewport();
                            if (!isVisible) {
                                console.log(`帖子不在可视区域，滚动到: ${postTitleText}`);
                                await handle.evaluate(el => {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                });
                                await this.randomWait(1000, 2000);
                            }
                            
                            // 存储原始URL用于内容保存
                            const originalPostUrl = postUrl;
                            
                            // 使用PostProcessor模块的handlePostClick方法处理帖子点击
                            console.log(`尝试点击帖子: ${postTitleText}`);
                            
                            // 使用PostProcessor模块处理点击，它包含了更可靠的点击和等待逻辑
                            const clickResult = await this.postProcessor.handlePostClick(handle, urlHash);
                            let clickSuccess = clickResult.success;
                            
                            // 如果PostProcessor的方法失败，尝试使用备用方法
                            if (!clickSuccess) {
                                console.log(`使用PostProcessor点击失败，尝试备用方法`);
                                try {
                                    // 尝试使用交互模块
                                    if (this.browser.interaction) {
                                        console.log(`使用交互模块点击帖子: ${postTitleText}`);
                                        clickSuccess = await this.browser.interaction.clickElement(handle, { timeout: 5000 });
                                    }
                                    
                                    // 如果交互模块失败，使用直接点击方法
                                    if (!clickSuccess) {
                                        let clickAttempts = 0;
                                        const maxClickAttempts = 3;
                            
                                        while (!clickSuccess && clickAttempts < maxClickAttempts) {
                                            try {
                                                // Get element position for click
                                                const box = await handle.boundingBox();
                                                if (!box) {
                                                    throw new Error('无法获取元素位置');
                                                }
                                                
                                                // Click in the center of the element
                                                await this.browser.page.mouse.move(box.x + box.width/2, box.y + box.height/2);
                                                await this.browser.page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                                                
                                                // Wait for navigation or detail content with increased timeout
                                                await Promise.race([
                                                    this.browser.page.waitForSelector('#detail-title', { timeout: 10000 }),
                                                    this.browser.page.waitForNavigation({ timeout: 10000 })
                                                ]);
                                                
                                                // Additional check for content loading (from old version)
                                                await this.browser.page.waitForFunction(
                                                    (titleSelector, textSelector) => {
                                                        const titleEl = document.querySelector(titleSelector);
                                                        const textEl = document.querySelector(textSelector);
                                                        return titleEl && textEl && (titleEl.innerText.trim() !== '' || textEl.innerText.trim() !== '');
                                                    },
                                                    { timeout: 10000 },
                                                    this.postProcessor.POST_DETAIL_TITLE_SELECTOR,
                                                    this.postProcessor.POST_DETAIL_TEXT_SELECTOR
                                                );
                                                
                                                clickSuccess = true;
                                                console.log(`成功点击帖子: ${postTitleText}`);
                                            } catch (clickError) {
                                                clickAttempts++;
                                                console.warn(`点击尝试 ${clickAttempts} 失败: ${clickError.message}`);
                                                await this.randomWait(1000, 2000);
                                            }
                                        }
                                    }
                                } catch (interactionError) {
                                    console.warn(`交互模块点击失败: ${interactionError.message}`);
                                }
                            }
                            
                            if (!clickSuccess) {
                                console.log(`多次尝试后无法点击帖子: ${postTitleText}`);
                                continue;
                            }

                            clickedInLoop++;
                            foundNewPostInLoop = true;
                            processedUrls.add(urlHash);
                            await this.randomWait();

                            // Process post content
                            const pageContent = await this.postProcessor.extractPostContent(
                                this.postProcessor.POST_DETAIL_TITLE_SELECTOR,
                                this.postProcessor.POST_DETAIL_TEXT_SELECTOR
                            );

                            if (!pageContent) {
                                console.log('无法提取帖子内容，跳过');
                                continue;
                            }

                            // Collect comments
                            const comments = await this.commentCollector.collectComments();

                            const noteDir = this.fileManager.createNoteDirectory(taskDir, processedCount + 1);

                            // Save page HTML if requested
                            if (task.html) {
                                const htmlContent = await this.browser.page.content();
                                this.fileManager.savePageContent(path.join(noteDir, 'page.html'), htmlContent);
                            }

                            // Process images
                            const { images, ocr_texts } = await this.imageProcessor.processImages(noteDir, task.noimage);

                            // Prepare and save content
                            const content = {
                                title: pageContent.title,
                                text: pageContent.text,
                                comments,
                                url: clickResult && clickResult.postInfo && clickResult.postInfo.url ? clickResult.postInfo.url : (originalPostUrl || `https://www.xiaohongshu.com/search_result/${task.keyword}`),
                                images,
                                ocr_texts
                            };

                            this.fileManager.saveJsonContent(path.join(noteDir, 'content.json'), content);

                            this.postProcessor.addProcessedUrl(urlHash);
                            processedCount++;
                            console.log(`成功处理第 ${processedCount}/${maxItems} 个帖子: ${content.title}`);

                            // Exit post detail
                            await this.browser.page.keyboard.press('Escape');
                            await this.randomWait();
                        } catch (postError) {
                            console.error('处理帖子时出错:', postError);
                            // Try to exit post detail view if we're stuck there
                            try {
                                await this.browser.page.keyboard.press('Escape');
                                await this.randomWait();
                            } catch (e) {
                                // Ignore errors when trying to recover
                            }
                        }
                    }

                    // Reset retry counter if we found and processed new posts
                    if (foundNewPostInLoop && clickedInLoop > 0) {
                        this.noNewContentRetries = 0;
                        await this.randomWait();
                    } else {
                        // If no new posts were processed, increment retry counter
                        this.noNewContentRetries++;
                        console.log(`本次滚动未发现新帖子，重试次数: ${this.noNewContentRetries}/${this.maxNoNewContentRetries}`);
                        if (this.noNewContentRetries >= this.maxNoNewContentRetries) {
                            console.log(`多次尝试后未发现新内容，尝试新的搜索`);
                            innerLoopActive = false; // Exit inner loop to try a new search
                        }
                    }
                } // End of inner while loop
                
                // If we've processed enough items, break out of the outer loop too
                if (processedCount >= maxItems) {
                    break;
                }
                
                // If inner loop ended but we still need more items, try a new search
                searchRetryCount++;
                console.log(`尝试新的搜索 (${searchRetryCount}/${maxSearchRetries})...`);
                await this.randomWait(5000, 8000);
                
            } catch (error) {
                console.error('处理任务时发生严重错误:', error);
                searchRetryCount++;
                await this.randomWait(8000, 12000); // Wait longer after an error
            }
        } // End of outer while loop
        
        console.log(`任务完成，共处理 ${processedCount} 个帖子`);
        
        try {
            await this.fileManager.mergeJsonFiles(taskDir, task.keyword, task.export);
        } catch (mergeError) {
            console.error('合并JSON文件时出错:', mergeError);
        }
    }

    async close() {
        if (this.browser && this.browser.core) {
            try {
                await this.browser.core.browser.close();
                console.log('Browser closed successfully');
            } catch (error) {
                console.error('Error closing browser:', error);
            }
        }
    }
}

module.exports = XhsCrawler;