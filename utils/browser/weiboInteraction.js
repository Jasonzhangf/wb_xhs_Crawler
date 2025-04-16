const weiboConfig = require('../weiboConfig');

class WeiboInteraction {
    constructor(page) {
        this.page = page;
    }

    // 展开内容
    async clickExpandButtons() {
        let contentExpanded = false;
        let retryCount = 0;
        
        console.log('开始尝试展开内容...');
        
        const initialContentLengths = await this._getContentLengths();
        console.log('获取初始内容长度用于验证展开效果');
        
        while (retryCount < weiboConfig.MAX_RETRIES && !contentExpanded) {
            console.log(`\n第${retryCount + 1}次尝试展开内容...`);
            
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
            
            await this._wait(weiboConfig.WAIT_TIMES.CONTENT_EXPANSION);
            
            const currentContentLengths = await this._getContentLengths();
            contentExpanded = await this._verifyContentExpanded(initialContentLengths, currentContentLengths);
            
            if (contentExpanded) {
                console.log('内容已成功展开，验证通过');
                break;
            }
            
            retryCount++;
            if (retryCount < weiboConfig.MAX_RETRIES && !contentExpanded) {
                console.log(`等待 ${weiboConfig.WAIT_TIMES.BUTTON_RETRY_DELAY}ms 后进行下一次尝试...`);
                await this._wait(weiboConfig.WAIT_TIMES.BUTTON_RETRY_DELAY);
            }
        }
        
        console.log(`内容展开状态: ${contentExpanded ? '成功' : '未成功'}`);
        return contentExpanded;
    }

    // 检查是否存在下一页按钮
    async hasNextPage() {
        console.log('检查是否存在下一页按钮...');
        const hasNextButton = await this.page.evaluate(() => {
            const nextButtons = Array.from(document.querySelectorAll('a.next, .next-page, a[action-type="feed_list_page_next"], a[action-type="feed_list_page_n"]'));
            return nextButtons.some(btn => {
                const style = getComputedStyle(btn);
                return btn.offsetParent !== null && 
                       style.display !== 'none' && 
                       style.visibility !== 'hidden' &&
                       !btn.disabled;
            });
        });
        console.log(`下一页按钮状态: ${hasNextButton ? '存在' : '不存在'}`);
        return hasNextButton;
    }

    // 通过URL参数翻页
    async clickNextPage() {
        console.log('准备进行翻页...');
        
        const hasNext = await this.hasNextPage();
        if (!hasNext) {
            console.log('没有找到下一页按钮，搜索结束');
            return false;
        }

        const currentUrl = await this.page.url();
        const url = new URL(currentUrl);
        const searchParams = url.searchParams;
        
        let currentPage = parseInt(searchParams.get('page') || '1');
        const nextPage = currentPage + 1;
        
        searchParams.set('page', nextPage.toString());
        const nextPageUrl = url.toString();
        
        console.log(`正在导航到第 ${nextPage} 页...`);
        await this._navigateToPage(nextPageUrl);
        
        return true;
    }

    // 导航到目标页面
    async _navigateToPage(url) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                await this.page.goto(url, { 
                    waitUntil: 'networkidle2',
                    timeout: 10000
                });
                await this._wait(weiboConfig.WAIT_TIMES.PAGE_LOAD);
                return;
            } catch (error) {
                console.error(`导航失败: ${error.message}`);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw new Error(`导航失败，已达到最大重试次数${maxRetries}次`);
                }
                await this._wait(2000);
            }
        }
    }

    // 等待指定时间
    async _wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // 获取内容长度
    async _getContentLengths() {
        return await this.page.evaluate(() => {
            const contentElements = Array.from(document.querySelectorAll('[node-type="feed_list_content"], [node-type="feed_list_content_full"]'));
            
            return contentElements.map(el => ({
                id: el.id || Math.random().toString(36).substring(2, 10),
                text: el.textContent.trim(),
                length: el.textContent.trim().length,
                hasMoreLink: el.querySelector('a[action-type="fl_unfold"]') !== null || 
                             el.innerHTML.includes('展开') ||
                             el.innerHTML.includes('全文')
            }));
        });
    }
    
    // 验证内容是否展开
    async _verifyContentExpanded(initialContents, currentContents) {
        if (initialContents.length !== currentContents.length) {
            return true;
        }
        
        let expanded = false;
        let totalLengthBefore = 0;
        let totalLengthAfter = 0;
        
        for (let i = 0; i < initialContents.length; i++) {
            totalLengthBefore += initialContents[i].length;
            totalLengthAfter += currentContents[i].length;
            
            if (currentContents[i].length > initialContents[i].length || 
                (initialContents[i].hasMoreLink && !currentContents[i].hasMoreLink)) {
                expanded = true;
                break;
            }
        }
        
        return expanded || totalLengthAfter > totalLengthBefore;
    }
}

module.exports = WeiboInteraction;