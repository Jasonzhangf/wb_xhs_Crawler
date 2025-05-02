const path = require('path');
const fs = require('fs');

class PostProcessor {
    constructor(browser, options = {}) {
        this.browser = browser;
        this.processedPostUrls = new Set();
        this.processedInThisScroll = new Set();
        this.POST_TITLE_LIST_SELECTOR = '[data-v-a264b01a].title';
        this.POST_DETAIL_TITLE_SELECTOR = '#detail-title';
        this.POST_DETAIL_TEXT_SELECTOR = '#detail-desc .note-text';
        this.CLICK_RETRY_DELAY = options.clickRetryDelay || 1000;
        this.MAX_CLICK_RETRIES = options.maxClickRetries || 3;
        this.CLICK_TIMEOUT = options.clickTimeout || 5000;
    }

    async processPostTitles(maxItems, processedCount) {
        try {
            // Wait for at least one post title to be present
            await this.browser.page.waitForSelector(this.POST_TITLE_LIST_SELECTOR, { timeout: 5000 });
            
            const postTitleHandles = await this.browser.page.$$(this.POST_TITLE_LIST_SELECTOR);
            console.log(`Found ${postTitleHandles.length} post title elements on current page`);

            if (postTitleHandles.length === 0) {
                if (processedCount === 0) {
                    console.warn('No post titles found, please check selectors or page loading');
                    return { success: false, handles: [], reason: 'no_posts_found' };
                }
                return { success: false, handles: [], reason: 'no_more_posts' };
            }

            // Filter out already processed posts
            const unprocessedHandles = [];
            for (const handle of postTitleHandles) {
                try {
                    // More robust URL extraction - first try closest('a')
                    let postUrl = await handle.evaluate(el => {
                        // Try multiple methods to find the URL
                        // 1. Check if element is inside an anchor
                        const anchor = el.closest('a');
                        if (anchor && anchor.href) return anchor.href;
                        
                        // 2. Check for parent anchor
                        let parent = el.parentElement;
                        while (parent) {
                            if (parent.tagName === 'A' && parent.href) return parent.href;
                            parent = parent.parentElement;
                        }
                        
                        // 3. Look for nearby anchors
                        const nearbyAnchor = el.parentElement?.querySelector('a');
                        if (nearbyAnchor && nearbyAnchor.href) return nearbyAnchor.href;
                        
                        return '';
                    });
                    
                    // If we still don't have a URL, use the title text as a fallback identifier
                    const postTitleText = await handle.evaluate(el => el.textContent?.trim() || 'unknown');
                    const urlHash = require('crypto').createHash('md5').update(postUrl || postTitleText).digest('hex');
                    
                    if (!this.hasProcessedUrl(urlHash)) {
                        unprocessedHandles.push(handle);
                    }
                } catch (error) {
                    console.error('Error extracting URL from post title:', error.message);
                    // Still add the handle so we can try to process it
                    unprocessedHandles.push(handle);
                }
            }

            console.log(`Found ${unprocessedHandles.length} unprocessed posts out of ${postTitleHandles.length} total posts`);
            return { success: true, handles: unprocessedHandles };
        } catch (error) {
            console.error('Error processing post titles:', error.message);
            return { success: false, handles: [], reason: 'error', error };
        }
    }

    async extractPostContent(titleSelector, textSelector) {
        try {
            await this.browser.page.waitForFunction(
                (titleSel, textSel) => {
                    const titleEl = document.querySelector(titleSel);
                    const textEl = document.querySelector(textSel);
                    return titleEl && textEl && (titleEl.innerText.trim() !== '' || textEl.innerText.trim() !== '');
                },
                { timeout: 10000 },
                titleSelector,
                textSelector
            );
            console.log('Post detail key elements loaded with content');

            const pageContent = await this.browser.page.evaluate((titleSel, textSel) => {
                const title = document.querySelector(titleSel)?.innerText?.trim() || '';
                const text = document.querySelector(textSel)?.innerText?.trim() || '';
                return { title, text };
            }, titleSelector, textSelector);

            return pageContent;
        } catch (error) {
            console.warn(`Waiting for post detail elements timed out or no content: ${error.message}`);
            return null;
        }
    }

    async handlePostClick(handle, urlHash) {
        let postTitleText = 'Unknown Title';
        let postUrl = null;
        let clickRetries = 0;

        try {
            // Get post title text for logging
            postTitleText = await handle.evaluate(el => el.textContent?.trim() || '');
            
            // Use the same robust URL extraction as in processPostTitles
            postUrl = await handle.evaluate(el => {
                // Try multiple methods to find the URL
                // 1. Check if element is inside an anchor
                const anchor = el.closest('a');
                if (anchor && anchor.href) return anchor.href;
                
                // 2. Check for parent anchor
                let parent = el.parentElement;
                while (parent) {
                    if (parent.tagName === 'A' && parent.href) return parent.href;
                    parent = parent.parentElement;
                }
                
                // 3. Look for nearby anchors
                const nearbyAnchor = el.parentElement?.querySelector('a');
                if (nearbyAnchor && nearbyAnchor.href) return nearbyAnchor.href;
                
                return '';
            });
            
            console.log(`Post title: "${postTitleText}", URL: ${postUrl || 'Not found'}`);

            if (this.processedInThisScroll.has(urlHash) || this.processedPostUrls.has(urlHash)) {
                return { success: false, reason: 'already_processed' };
            }

            // Ensure element is in viewport
            const isVisible = await handle.isIntersectingViewport();
            if (!isVisible) {
                console.log(`Post not in viewport, scrolling to it: "${postTitleText}"`);
                await handle.evaluate(el => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                await this.browser.waitForTimeout(1000); // Longer wait after scrolling
            }

            try {
                console.log(`Attempting to click post title: "${postTitleText}"`);
                
                // Get element position for click
                const box = await handle.boundingBox();
                if (!box) {
                    throw new Error('Could not get element position');
                }
                console.log('Got element bounding box:', box);

                // Click in the center of the element
                await this.browser.page.mouse.move(box.x + box.width/2, box.y + box.height/2);
                await this.browser.page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                
                // Wait for navigation or detail content
                await Promise.race([
                    this.browser.page.waitForSelector(this.POST_DETAIL_TITLE_SELECTOR, { timeout: this.CLICK_TIMEOUT }),
                    this.browser.page.waitForNavigation({ timeout: this.CLICK_TIMEOUT })
                ]);

                return { 
                    success: true, 
                    postInfo: {
                        title: postTitleText,
                        url: postUrl
                    }
                };
            } catch (error) {
                console.warn(`Click failed for post "${postTitleText}": ${error.message}`);
                this.processedInThisScroll.add(urlHash);
                return { success: false, reason: 'click_failed', error };
            }

            console.warn(`Failed to click post title after ${this.MAX_CLICK_RETRIES} attempts: "${postTitleText}"`);
            this.processedInThisScroll.add(urlHash);
            return { success: false, reason: 'click_failed' };
        } catch (error) {
            console.error(`Error processing post "${postTitleText}": ${error.message}`);
            return { success: false, reason: 'error', error };
        }
    }

    clearProcessedInScroll() {
        this.processedInThisScroll.clear();
    }

    addProcessedUrl(urlHash) {
        this.processedPostUrls.add(urlHash);
        this.processedInThisScroll.add(urlHash);
    }

    hasProcessedUrl(urlHash) {
        return this.processedPostUrls.has(urlHash) || this.processedInThisScroll.has(urlHash);
    }
}

module.exports = PostProcessor;