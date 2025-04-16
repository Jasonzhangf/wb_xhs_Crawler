const weiboConfig = require('../weiboConfig');

class WeiboScrolling {
    // 检查页面导航按钮状态
    async checkNavigationButtons() {
        console.log('检查页面导航按钮状态...');
        const buttonStatus = await this.page.evaluate(() => {
            const nextButton = document.querySelector('.s-scroll a.next, .m-page a.next, .W_pages a.next');
            const prevButton = document.querySelector('.s-scroll a.prev, .m-page a.prev, .W_pages a.prev');
            
            // 检查下一页按钮是否存在且可见
            const nextButtonVisible = nextButton && 
                window.getComputedStyle(nextButton).display !== 'none' && 
                window.getComputedStyle(nextButton).visibility !== 'hidden' &&
                !nextButton.disabled;

            // 检查上一页按钮是否存在且可见
            const prevButtonVisible = prevButton && 
                window.getComputedStyle(prevButton).display !== 'none' && 
                window.getComputedStyle(prevButton).visibility !== 'hidden' &&
                !prevButton.disabled;
            
            return {
                hasNextButton: nextButtonVisible,
                hasPrevButton: prevButtonVisible
            };
        });
        
        console.log('导航按钮状态：', buttonStatus);
        return buttonStatus;
    }
    constructor(page) {
        this.page = page;
    }

    // 滚动页面 - 优化版：更慢速滚动并在每次滚动后确保展开按钮被点击，同时检查导航按钮
    async scrollPage() {
        console.log('开始模拟人类自然滚动...');
        
        // 不再预先滚动整个页面，而是每次只滚动一小部分
        const scrollResult = await this.page.evaluate(async () => {
            const result = { startHeight: 0, endHeight: 0, scrollCount: 0, reachedBottom: false };
            result.startHeight = document.documentElement.scrollHeight;
            
            // 只滚动一个视窗高度的一小部分
            const viewportHeight = window.innerHeight;
            // 每次只滚动视窗高度的20%，进一步减慢滚动速度
            const scrollDistance = Math.floor(viewportHeight * 0.2);
            
            // 使用平滑滚动，速度更慢
            window.scrollBy({
                top: scrollDistance,
                behavior: 'smooth'
            });
            
            // 等待滚动完成，延长等待时间以模拟人类浏览节奏
            await new Promise(resolve => setTimeout(resolve, 2000));
            result.scrollCount++;
            
            result.endHeight = document.documentElement.scrollHeight;
            
            // 检查是否已经滚动到底部
            const scrollPosition = window.scrollY + window.innerHeight;
            result.reachedBottom = Math.abs(scrollPosition - document.documentElement.scrollHeight) < 10;
            
            return result;
        });
        
        console.log(`单次滚动统计：`);
        console.log(`- 初始页面高度：${scrollResult.startHeight}px`);
        console.log(`- 当前页面高度：${scrollResult.endHeight}px`);
        
        // 滚动后检查视野内的展开按钮并点击
        console.log('滚动后检查视野内的展开按钮...');
        const expandResult = await this.page.evaluate((selectors) => {
            const result = { found: 0, clicked: 0, details: [] };
            
            // 获取当前视野范围
            const viewportHeight = window.innerHeight;
            const viewportTop = window.scrollY;
            const viewportBottom = viewportTop + viewportHeight;
            
            // 添加特定的搜索结果页面展开按钮选择器
            const additionalSelectors = [
                'a[action-type="fl_unfold"]',
                '.card-feed a[action-type="fl_unfold"]',
                '.content p[node-type="feed_list_content"] a[action-type="fl_unfold"]',
                '.txt a[action-type="fl_unfold"]'
            ];
            
            const allSelectors = [...selectors, ...additionalSelectors];
            
            for (const selector of allSelectors) {
                const buttons = Array.from(document.querySelectorAll(selector));
                result.found += buttons.length;
                
                // 过滤出当前视野内的按钮
                const visibleButtons = buttons.filter(btn => {
                    const rect = btn.getBoundingClientRect();
                    const elementTop = rect.top + window.scrollY;
                    const elementBottom = rect.bottom + window.scrollY;
                    
                    // 检查按钮是否在当前视野内
                    const isInViewport = elementBottom > viewportTop && elementTop < viewportBottom;
                    
                    const style = getComputedStyle(btn);
                    const isVisible = rect.width > 0 && rect.height > 0 &&
                                     btn.offsetParent !== null &&
                                     style.display !== 'none' &&
                                     style.visibility !== 'hidden' &&
                                     !btn.disabled;
                    
                    // 增强展开按钮识别逻辑
                    const isExpandButton = btn.getAttribute('action-type') === 'fl_unfold' || 
                                         btn.className.includes('expand') || 
                                         btn.textContent.includes('展开') ||
                                         (btn.textContent && btn.textContent.trim() === '展开') ||
                                         btn.innerHTML.includes('展开') ||
                                         btn.parentElement && btn.parentElement.className.includes('unfold');
                    
                    return isInViewport && isVisible && isExpandButton;
                });
                
                // 点击当前视野内的所有展开按钮
                visibleButtons.forEach(btn => {
                    try {
                        // 尝试滚动到按钮位置
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // 点击按钮
                        btn.click();
                        result.clicked++;
                        result.details.push({
                            selector: selector,
                            text: btn.textContent || btn.innerText,
                            position: `${btn.getBoundingClientRect().top},${btn.getBoundingClientRect().left}`,
                            actionType: btn.getAttribute('action-type') || 'none'
                        });
                    } catch (e) {
                        console.log(`点击按钮失败: ${e.message}`);
                    }
                });
            }
            
            return result;
        }, weiboConfig.SELECTORS.EXPAND_BUTTONS);
        
        console.log(`当前视野内展开按钮统计：`);
        console.log(`- 找到展开按钮：${expandResult.found}个`);
        console.log(`- 成功点击：${expandResult.clicked}个`);
        
        if (expandResult.details.length > 0) {
            console.log('点击详情:');
            expandResult.details.forEach((detail, index) => {
                console.log(`  ${index + 1}. 选择器: ${detail.selector}`);
                console.log(`     文本内容: ${detail.text}`);
                console.log(`     位置: ${detail.position}`);
                console.log(`     action-type: ${detail.actionType}`);
            });
        }
        
        // 等待内容展开
        console.log(`等待 ${weiboConfig.WAIT_TIMES.CONTENT_EXPANSION}ms 以确保内容完全展开...`);
        await this._wait(weiboConfig.WAIT_TIMES.CONTENT_EXPANSION);
        
        // 等待内容加载，延长等待时间
        await this._wait(weiboConfig.WAIT_TIMES.SCROLL_DELAY * 1.5);

        // 如果滚动到底部，检查导航按钮状态
        if (scrollResult.reachedBottom) {
            console.log('已滚动到页面底部，检查导航按钮状态...');
            const { hasNextButton, hasPrevButton } = await this.checkNavigationButtons();
            
            return {
                height: scrollResult.endHeight,
                reachedBottom: true,
                hasNextButton,
                hasPrevButton
            };
        }

        return {
            height: scrollResult.endHeight,
            reachedBottom: false,
            hasNextButton: true,
            hasPrevButton: false
        };
    }

    // 等待指定时间 - 内部方法
    async _wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = WeiboScrolling;