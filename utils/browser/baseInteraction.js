class BaseInteraction {
    constructor(page) {
        this.page = page;
    }

    // 等待指定时间
    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    // 等待元素加载
    async waitForSelector(selector, timeout = 10000) {
        try {
            await this.page.waitForSelector(selector, { timeout });
            return true;
        } catch (error) {
            console.warn(`等待元素 ${selector} 超时`);
            return false;
        }
    }

    // 点击元素
    async clickElement(elementOrHandle, options = {}) {
        let handle = elementOrHandle;
        let boundingBox = null;
        const timeout = options.timeout || 5000; // Default timeout

        try {
            // Check if it's an ElementHandle
            if (typeof elementOrHandle.asElement === 'function') {
                handle = elementOrHandle;
                // Attempt to get bounding box for hover/click coordinates
                boundingBox = await handle.boundingBox();
                if (!boundingBox) {
                    console.warn('无法获取元素的边界框，可能元素不可见或已从DOM中移除');
                    // Try clicking center of viewport as fallback or just fail?
                    // For now, let's try clicking the handle directly if box fails
                } else {
                    console.log('获取到元素边界框:', boundingBox);
                }
            } else {
                // If it's the old object structure, try to find the element handle
                console.warn('接收到旧的对象结构，尝试查找元素句柄:', elementOrHandle.selector);
                handle = await this.page.waitForSelector(elementOrHandle.selector, { visible: true, timeout });
                if (!handle) {
                    console.error(`使用选择器 ${elementOrHandle.selector} 未找到元素`);
                    return false;
                }
                boundingBox = await handle.boundingBox();
                if (!boundingBox) {
                    console.warn(`找到元素 ${elementOrHandle.selector} 但无法获取边界框`);
                }
            }

            if (!handle) {
                console.error('无法获取有效的元素句柄进行点击');
                return false;
            }

            // 1. Ensure element is in viewport
            const isVisible = await handle.isIntersectingViewport();
            if (!isVisible) {
                console.log('元素不在视口内，尝试滚动到元素位置...');
                await handle.scrollIntoViewIfNeeded();
                await this.page.waitForTimeout(500); // Wait briefly for scroll
                // Re-check visibility and bounding box after scroll
                if (!await handle.isIntersectingViewport()) {
                    console.warn('滚动后元素仍然不在视口内');
                    // Decide fallback strategy: maybe try clicking anyway or fail
                }
                boundingBox = await handle.boundingBox(); // Update bounding box after scroll
                if (!boundingBox) {
                     console.warn('滚动后仍无法获取边界框');
                }
            }

            console.log('准备点击元素...');

            // 2. Simulate Hover (if boundingBox is available)
            if (boundingBox && boundingBox.width > 0 && boundingBox.height > 0) {
                const hoverX = boundingBox.x + boundingBox.width / 2;
                const hoverY = boundingBox.y + boundingBox.height / 2;
                console.log(`模拟鼠标悬停至: (${hoverX.toFixed(0)}, ${hoverY.toFixed(0)})`);
                try {
                    await this.page.mouse.move(hoverX, hoverY, { steps: 5 }); // Simulate smoother movement
                    await this.page.waitForTimeout(100 + Math.random() * 200); // Short random pause after hover
                } catch (hoverError) {
                    console.warn(`模拟悬停时出错: ${hoverError.message} - 尝试继续点击`);
                }
            } else {
                console.log('无有效边界框，跳过悬停模拟');
            }

            // 3. Click the element
            // Use Puppeteer's built-in click which handles many edge cases
            await handle.click({ delay: 50 + Math.random() * 100 }); // Add small random delay

            console.log('✓ 元素点击成功');
            return true;
        } catch (error) {
            console.error('点击元素时发生错误:');
            console.error(`- 错误类型: ${error.name}`);
            console.error(`- 错误信息: ${error.message}`);
            // Log more context if available
            if (typeof elementOrHandle === 'object' && elementOrHandle.selector) {
                 console.error(`- 选择器: ${elementOrHandle.selector}`);
            }
            return false;
        }
    }

    // 输入文本
    async typeText(selector, text) {
        try {
            await this.waitForSelector(selector);
            await this.page.type(selector, text);
            return true;
        } catch (error) {
            console.warn(`输入文本到元素 ${selector} 失败`);
            return false;
        }
    }

    // 获取元素是否可见
    async isElementVisible(selector) {
        try {
            await this.waitForSelector(selector);
            return await this.page.evaluate(selector => {
                const element = document.querySelector(selector);
                if (!element) return false;
                const style = window.getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }, selector);
        } catch (error) {
            return false;
        }
    }

    // 等待元素消失
    async waitForElementToDisappear(selector, timeout = 10000) {
        try {
            await this.page.waitForSelector(selector, { hidden: true, timeout });
            return true;
        } catch (error) {
            console.warn(`等待元素 ${selector} 消失超时`);
            return false;
        }
    }

    // 点击展开按钮，子类需要实现此方法
    async clickExpandButtons() {
        throw new Error('clickExpandButtons method must be implemented by child class');
    }

    // 点击下一页，子类需要实现此方法
    async clickNextPage() {
        throw new Error('clickNextPage method must be implemented by child class');
    }
}

module.exports = BaseInteraction;