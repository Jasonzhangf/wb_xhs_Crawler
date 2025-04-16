const weiboConfig = require('../weiboConfig');

class WeiboUserCapture {
    constructor(page) {
        this.page = page;
    }

    async captureUserPosts(maxItems) {
        console.log('开始捕获用户微博内容...');
        
        // 等待用户主页内容加载
        await this.page.waitForSelector('.WB_feed', { timeout: weiboConfig.WAIT_TIMES.PAGE_LOAD });
        
        const posts = [];
        let lastHeight = 0;
        
        while (posts.length < maxItems) {
            // 获取当前可见的微博内容
            const newPosts = await this.page.evaluate(() => {
                const items = [];
                document.querySelectorAll('.WB_feed_detail').forEach(feed => {
                    const content = feed.querySelector('.WB_text')?.textContent.trim();
                    const time = feed.querySelector('.WB_from')?.textContent.trim();
                    const likes = feed.querySelector('.pos[node-type="like_status"] em:last-child')?.textContent;
                    const reposts = feed.querySelector('.pos[node-type="forward_btn_text"] em:last-child')?.textContent;
                    const comments = feed.querySelector('.pos[node-type="comment_btn_text"] em:last-child')?.textContent;
                    
                    if (content) {
                        items.push({
                            content,
                            time,
                            likes: likes || '0',
                            reposts: reposts || '0',
                            comments: comments || '0'
                        });
                    }
                });
                return items;
            });
            
            // 添加新获取的微博到结果集
            posts.push(...newPosts);
            console.log(`已获取 ${posts.length} 条微博`);
            
            if (posts.length >= maxItems) break;
            
            // 滚动页面加载更多内容
            await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await this.page.waitForTimeout(weiboConfig.WAIT_TIMES.SCROLL_DELAY);
            
            // 检查是否到达页面底部
            const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === lastHeight) {
                console.log('已到达页面底部');
                break;
            }
            lastHeight = currentHeight;
        }
        
        return posts.slice(0, maxItems);
    }
}

module.exports = WeiboUserCapture;