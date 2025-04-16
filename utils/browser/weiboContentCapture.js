const weiboConfig = require('../weiboConfig');

class WeiboContentCapture {
    constructor(page) {
        this.page = page;
    }

    // 获取微博内容
    async getWeiboContent() {
        console.log('开始捕获微博内容...');
        
        // 移除noimage判断逻辑，始终执行内容捕获
        // 移除了基于NO_IMAGE的返回空结果逻辑
        
        // 检查页面URL和标题，帮助诊断问题
        const currentUrl = await this.page.url();
        const pageTitle = await this.page.title();
        console.log(`当前页面URL: ${currentUrl}`);
        console.log(`当前页面标题: ${pageTitle}`);
        
        // 检查页面是否有登录状态
        const isLoggedIn = await this.page.evaluate(() => {
            // 检查常见的登录状态元素
            const loginElements = document.querySelectorAll('.login-btn, .login-button, .LoginBtn');
            const userInfoElements = document.querySelectorAll('.user-info, .profile-info, .user-name');
            return {
                loginButtonsFound: loginElements.length,
                userInfoFound: userInfoElements.length,
                bodyHTML: document.body.innerHTML.length, // 获取页面HTML长度，用于判断页面是否有内容
                hasContent: document.body.textContent.trim().length > 100 // 简单判断页面是否有内容
            };
        });
        
        console.log('页面状态检查:');
        console.log(`- 登录按钮数量: ${isLoggedIn.loginButtonsFound}`);
        console.log(`- 用户信息元素数量: ${isLoggedIn.userInfoFound}`);
        console.log(`- 页面HTML长度: ${isLoggedIn.bodyHTML}`);
        console.log(`- 页面是否有内容: ${isLoggedIn.hasContent ? '是' : '否'}`);
        
        // 等待更长时间确保页面完全加载
        console.log('额外等待2秒确保页面完全加载...');
        await this._wait(weiboConfig.WAIT_TIMES.CONTENT_EXPANSION); // 使用CONTENT_EXPANSION替代CONTENT_LOAD
        
        // 使用已导入的weiboConfig，避免变量重定义
        const { NO_IMAGE, SELECTORS } = weiboConfig;
        
        // 记录当前noimage参数值，便于调试
        
        const content = await this.page.evaluate(({ textSelector, imgSelector, noImage }) => {
            const elements = [];
            const results = { total: 0, visible: 0, withText: 0, withImages: 0, details: [] };
            const processedTexts = new Set();
            
            // 检测是否为搜索结果页面
            const isSearchPage = window.location.href.includes('s.weibo.com/weibo') || 
                               document.querySelector('.search-input') !== null ||
                               document.querySelector('.search-box') !== null;
            
            // 图片处理开关 - 根据noImage参数决定是否处理图片
            const PROCESS_IMAGES = !noImage;
            
            // 记录页面DOM结构信息
            const domInfo = {
                bodyChildren: document.body.children.length,
                mainContent: document.querySelector('main') ? true : false,
                feedContainer: document.querySelector('.feed-container') ? true : false,
                articleCount: document.querySelectorAll('article').length,
                divCount: document.querySelectorAll('div').length,
                cardFeedCount: document.querySelectorAll('.card-feed').length,
                feedListContentCount: document.querySelectorAll('[node-type="feed_list_content"]').length
            };
            console.log('页面DOM结构信息:', JSON.stringify(domInfo));
            
            // 改进选择器匹配逻辑 - 添加更多可能的选择器，特别是针对搜索结果页面
            const selectors = [
                // 微博搜索结果页面特定选择器
                '.card-feed .content p[node-type="feed_list_content"]',  // 搜索结果卡片中的内容
                '.card-feed .txt p[node-type="feed_list_content"]',     // 搜索结果卡片中的文本
                '.card-feed .content .txt',                              // 搜索结果卡片中的文本
                '.card-feed .content p[node-type="feed_list_content_full"]', // 展开后的完整内容
                '.card-feed .txt[node-type="feed_list_content"]',       // 直接文本内容
                '.card-feed .txt[node-type="feed_list_content_full"]',  // 展开后的直接文本内容
                
                // 搜索结果页面特定结构
                '.card .content p.txt[node-type="feed_list_content"]',
                '.card .content p.txt[node-type="feed_list_content_full"]',
                '.search-feed .content p[node-type="feed_list_content"]',
                '.search-feed .content p[node-type="feed_list_content_full"]',
                
                // 通用微博内容选择器
                '.feed_list_content',
                '.WB_text',
                '.weibo-text',
                '.content',
                '.card-content',
                '.card-text',
                '.post-content',
                '.status-content',
                '.feed-content',                // 搜索结果页面常用
                '.avator + div',               // 搜索结果中头像旁边的内容
                '.feed-list-item .content',    // 搜索结果列表项内容
                '.card .content',              // 卡片内容
                '.card-feed .content',         // 卡片feed内容
                `[node-type="feed_list_content"]`,
                `[node-type="feed_list_content_full"]`,
                `[class*="${textSelector}"]`,
                `[class^="${textSelector}"]`,
                `[class$="${textSelector}"]`,
                `[class~="${textSelector}"]`,
                'p[node-type="feed_list_content"]',
                'div[node-type="feed_list_content"]',
                'span[node-type="feed_list_content"]',
                'article p',  // 文章段落
                '.card p',     // 卡片段落
                '.list-box p'  // 列表框段落
            ];
            
            // 添加搜索结果页面特定的错误处理
            if (isSearchPage) {
                console.log('检测到搜索结果页面，添加额外检查...');
                // 检查是否有搜索结果
                const noResult = document.querySelector('.search-noresult');
                if (noResult) {
                    console.log('搜索结果为空');
                    return { elements: [], results: { total: 0, visible: 0, withText: 0, withImages: 0, details: [] } };
                }
                
                // 检查是否需要登录
                const loginRequired = document.querySelector('.login-btn') || 
                                     document.querySelector('.LoginBtn') ||
                                     document.querySelector('.login-guide');
                if (loginRequired) {
                    console.log('需要登录才能查看搜索结果');
                }
            }
            
            console.log('使用改进后的选择器:', selectors);
            
            // 尝试查找所有可能包含微博内容的元素
            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    console.log(`选择器 ${selector} 找到 ${elements.length} 个元素`);
                } catch (e) {
                    console.log(`选择器 ${selector} 查询出错: ${e.message}`);
                }
            });
            
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    results.total++;
                    const rect = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    const isVisible = rect.width > 0 && rect.height > 0 &&
                        el.offsetParent !== null && 
                        !el.disabled && 
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0';
                    
                    if (isVisible) {
                        results.visible++;
                        const text = el.textContent || el.innerText || '';
                        const trimmedText = text.trim();
                        
                        // 查找最近的article元素或其他容器元素
                        const article = el.closest('article') || el.closest('.weibo-text') || el.closest('.card') || el.closest('.feed-item');
                        
                        // 初始化空的图片URL数组
                        const imgUrls = [];
                        
                        // 图片处理代码块 - 始终执行
                        if (PROCESS_IMAGES && article) {
                            // 查找图片容器
                            const imgContainer = article.querySelector(`[class*="${imgSelector}"]`) || 
                                article.querySelector('.media-box') || 
                                article.querySelector('.weibo-media') ||
                                article.querySelector('.img-box') ||
                                article.querySelector('.picture') ||
                                article.querySelector('.media-pic') ||
                                article.querySelector('.avator') ||
                                article.querySelector('.feed-list-item img') ||
                                article.querySelector('.card img');
                                
                            // 如果找到图片容器，提取图片URL
                            if (imgContainer) {
                                imgContainer.querySelectorAll('img').forEach(img => {
                                    if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:'))) {
                                        // 处理微博图片URL，确保获取高质量图片
                                        let imgUrl = img.src;
                                        // 替换缩略图为原图
                                        if (imgUrl.includes('thumbnail') || imgUrl.includes('thumb150') || imgUrl.includes('orj360')) {
                                            imgUrl = imgUrl.replace(/\/thumb150\/|\/orj360\/|\/thumbnail\//, '/large/');
                                        }
                                        imgUrls.push(imgUrl);
                                    }
                                });
                            } else {
                                // 直接在文章元素中查找图片
                                article.querySelectorAll('img').forEach(img => {
                                    if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:'))) {
                                        // 处理微博图片URL，确保获取高质量图片
                                        let imgUrl = img.src;
                                        // 替换缩略图为原图
                                        if (imgUrl.includes('thumbnail') || imgUrl.includes('thumb150') || imgUrl.includes('orj360')) {
                                            imgUrl = imgUrl.replace(/\/thumb150\/|\/orj360\/|\/thumbnail\//, '/large/');
                                        }
                                        imgUrls.push(imgUrl);
                                    }
                                });
                                
                                // 特别处理card-feed结构中的图片
                                const cardFeed = article.closest('.card-feed');
                                if (cardFeed) {
                                    // 查找.avator中的图片（用户头像）
                                    const avatarImg = cardFeed.querySelector('.avator img');
                                    if (avatarImg && avatarImg.src && (avatarImg.src.startsWith('http') || avatarImg.src.startsWith('data:'))) {
                                        imgUrls.push(avatarImg.src);
                                    }
                                }
                            }
                        }
                        
                        if (trimmedText && !processedTexts.has(trimmedText)) {
                            processedTexts.add(trimmedText);
                            results.withText++;
                            
                            // 处理图片和计数
                            if (imgUrls.length > 0) {
                                results.withImages++;
                            }
                            
                            // 获取微博URL
                            let weiboUrl = '';
                            const article = el.closest('article') || el.closest('.card-feed');
                            if (article) {
                                const linkElement = article.querySelector('a[href*="/detail/"]') || 
                                                  article.querySelector('a[href*="/status/"]') || 
                                                  article.querySelector('.from a[href*="weibo.com"]');
                                if (linkElement) {
                                    weiboUrl = linkElement.href;
                                }
                            }

                            elements.push({
                                text: trimmedText,
                                imgUrls: imgUrls,
                                className: el.className,
                                position: `${Math.round(rect.top)},${Math.round(rect.left)}`,
                                selector: selector,
                                url: weiboUrl
                            });
                            
                            results.details.push({
                                className: el.className,
                                position: `${Math.round(rect.top)},${Math.round(rect.left)}`,
                                textLength: trimmedText.length,
                                imageCount: imgUrls.length,
                                selector: selector
                            });
                        }
                    }
                });
            });
            
            // 检查是否有微博卡片
            const cards = document.querySelectorAll('article, .weibo-card, .card, .feed-item, .card-feed');
            console.log(`找到 ${cards.length} 个可能的微博卡片`);
            
            // 特别处理card-feed结构
            const cardFeeds = document.querySelectorAll('.card-feed');
            console.log(`找到 ${cardFeeds.length} 个card-feed结构`);
            
            // 如果有card-feed结构但没有找到内容，尝试直接从card-feed中提取
            if (cardFeeds.length > 0 && elements.length === 0) {
                cardFeeds.forEach(cardFeed => {
                    // 查找展开/收起的内容
                    const feedListContent = cardFeed.querySelector('p[node-type="feed_list_content"]');
                    const feedListContentFull = cardFeed.querySelector('p[node-type="feed_list_content_full"]');
                    
                    // 优先使用完整内容，如果没有则使用普通内容
                    const contentElement = feedListContentFull || feedListContent;
                    
                    if (contentElement) {
                        const text = contentElement.textContent || contentElement.innerText || '';
                        const trimmedText = text.trim();
                        
                        if (trimmedText && !processedTexts.has(trimmedText)) {
                            processedTexts.add(trimmedText);
                            
                            // 初始化空的图片URL数组
                            const imgUrls = [];
                            
                            // 图片处理代码块 - 始终执行
                            if (PROCESS_IMAGES) {
                                // 查找头像图片
                                const avatarImg = cardFeed.querySelector('.avator img');
                                if (avatarImg && avatarImg.src) {
                                    imgUrls.push(avatarImg.src);
                                }
                                
                                // 查找其他图片
                                cardFeed.querySelectorAll('img').forEach(img => {
                                    if (img.src && (img.src.startsWith('http') || img.src.startsWith('data:'))) {
                                        let imgUrl = img.src;
                                        if (imgUrl.includes('thumbnail') || imgUrl.includes('thumb150') || imgUrl.includes('orj360')) {
                                            imgUrl = imgUrl.replace(/\/thumb150\/|\/orj360\/|\/thumbnail\//, '/large/');
                                        }
                                        imgUrls.push(imgUrl);
                                    }
                                });
                            }
                            
                            // 获取微博URL
                            let weiboUrl = '';
                            const linkElement = cardFeed.querySelector('a[href*="/detail/"]') || 
                                              cardFeed.querySelector('a[href*="/status/"]') || 
                                              cardFeed.querySelector('.from a[href*="weibo.com"]');
                            if (linkElement) {
                                weiboUrl = linkElement.href;
                            }

                            elements.push({
                                text: trimmedText,
                                imgUrls: imgUrls,
                                className: contentElement.className,
                                position: 'card-feed-direct',
                                selector: 'card-feed-direct',
                                url: weiboUrl
                            });
                            
                            results.withText++;
                            // 只有当图片处理开关打开且有图片时才增加图片计数
                            if (PROCESS_IMAGES && imgUrls.length > 0) {
                                results.withImages++;
                            }
                        }
                    }
                });
            }
            
            return { elements, results, pageLoaded: document.readyState === 'complete' };
        }, {
            textSelector: SELECTORS.WEIBO_TEXT,
            imgSelector: SELECTORS.WEIBO_IMG,
            noImage: NO_IMAGE
        });
        
        console.log('内容捕获统计：');
        console.log(`- 找到元素总数：${content.results.total}`);
        console.log(`- 可见元素数：${content.results.visible}`);
        console.log(`- 包含文本数：${content.results.withText}`);
        console.log(`- 包含图片数：${content.results.withImages}`);
        
        if (content.results.details && content.results.details.length > 0) {
            console.log('\n捕获详情：');
            content.results.details.forEach((detail, index) => {
                console.log(`  ${index + 1}. 类名：${detail.className}`);
                console.log(`     位置：${detail.position}`);
                console.log(`     文本长度：${detail.textLength}`);
                console.log(`     图片数量：${detail.imageCount}`);
                console.log(`     选择器：${detail.selector}`);
            });
        } else {
            console.log('警告：未捕获到任何内容，请检查以下可能的原因：');
            console.log('1. 页面未完全加载 - 尝试增加等待时间');
            console.log('2. 选择器不匹配 - 需要更新选择器配置');
            console.log('3. 登录状态失效 - 需要更新Cookie');
            console.log('4. 页面结构变化 - 需要适配新的页面结构');
            console.log('5. 网络问题 - 检查网络连接');
        }
        
        return content.elements;
    }

    // 等待指定时间
    async _wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = WeiboContentCapture;