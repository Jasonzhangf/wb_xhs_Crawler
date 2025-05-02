class CommentCollector {
    constructor(browser, options = {}) {
        this.browser = browser;
        this.POST_DETAIL_COMMENT_SELECTOR = '[data-v-aed4aacc] .content';
        this.MAX_RETRIES = options.maxRetries || 3;
        this.RETRY_DELAY = options.retryDelay || 2000;
        this.SCROLL_DELAY = options.scrollDelay || 3000;
        this.NAVIGATION_TIMEOUT = options.navigationTimeout || 5000;
        this.TOTAL_TIMEOUT = options.totalTimeout || 60000; // 1 minute total timeout
        this.MAX_SCROLL_TIME = options.maxScrollTime || 30000; // 30 seconds max scroll time
    }

    async collectComments() {
        let retryCount = 0;
        let lastError = null;

        while (retryCount < this.MAX_RETRIES) {
            try {
                // Wait for comment container to be available
                await this.browser.page.waitForSelector('#noteContainer', { timeout: this.NAVIGATION_TIMEOUT });
                
                const comments = await this.browser.page.evaluate(async (config) => {
                    const comments = new Set();
                    
                    // Check for end markers
                    const hasEndMarker = () => {
                        return document.querySelector('#noteContainer > div.interaction-container > div.note-scroller > div.comments-el > div > div.end-container') ||
                               document.querySelector('#noteContainer > div.interaction-container > div.note-scroller > div.comments-el > div > p');
                    };
                    
                    // Collect visible comments
                    const collectComments = () => {
                        document.querySelectorAll(config.selector).forEach(el => {
                            const text = el.innerText?.trim();
                            if (text && text.length > 0) comments.add(text);
                        });
                    };

                    // Initial comment collection
                    collectComments();

                    // Get comment container
                    const container = document.querySelector('#noteContainer > div.interaction-container > div.note-scroller');
                    if (!container) {
                        console.log('Comment container not found');
                        return Array.from(comments);
                    }

                    let lastHeight = container.scrollHeight;
                    let noNewCount = 0;
                    const MAX_NO_NEW = 3;

                    // Keep scrolling until we reach the bottom or no new comments after multiple attempts
                    while (!hasEndMarker() && noNewCount < MAX_NO_NEW) {
                        const prevCount = comments.size;
                        const prevHeight = container.scrollHeight;

                        // Smooth scroll implementation
                        const scrollStep = Math.floor(container.clientHeight * 0.8);
                        const currentScroll = container.scrollTop;
                        const targetScroll = Math.min(currentScroll + scrollStep, container.scrollHeight - container.clientHeight);
                        
                        // Check if we've reached the bottom
                        const isAtBottom = Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 5;
                        
                        if (isAtBottom && comments.size === prevCount) {
                            console.log('Reached bottom of comments');
                            break;
                        }
                        
                        container.scrollTo({
                            top: targetScroll,
                            behavior: 'smooth'
                        });

                        await new Promise(r => setTimeout(r, config.scrollDelay));
                        collectComments();
                        
                        // Check for new comments
                        if (comments.size === prevCount) {
                            noNewCount++;
                            console.log(`No new comments found (attempt ${noNewCount}/${MAX_NO_NEW})`);
                        } else {
                            noNewCount = 0;
                            console.log(`Found ${comments.size - prevCount} new comments, total: ${comments.size}`);
                        }

                        // Update last height if content height changed
                        if (container.scrollHeight !== prevHeight) {
                            lastHeight = container.scrollHeight;
                        }
                    }
                    
                    return Array.from(comments);
                }, {
                    selector: this.POST_DETAIL_COMMENT_SELECTOR,
                    scrollDelay: this.SCROLL_DELAY
                });

                if (comments.length > 0) {
                    return comments;
                }

                throw new Error('No comments found after successful scroll');

            } catch (error) {
                lastError = error;
                console.error(`Error collecting comments (attempt ${retryCount + 1}/${this.MAX_RETRIES}):`, error.message);
                
                if (error.message.includes('Execution context was destroyed')) {
                    console.log('Navigation detected, waiting for page to stabilize...');
                    await new Promise(r => setTimeout(r, this.RETRY_DELAY));
                    
                    try {
                        await this.browser.page.waitForNavigation({ 
                            waitUntil: ['networkidle0', 'domcontentloaded'],
                            timeout: this.NAVIGATION_TIMEOUT
                        });
                        
                        // Additional wait for dynamic content
                        await this.browser.page.waitForTimeout(1000);
                    } catch (navError) {
                        console.log('Navigation timeout, continuing with retry...');
                    }
                }
                
                retryCount++;
                if (retryCount < this.MAX_RETRIES) {
                    console.log(`Retrying comment collection in ${this.RETRY_DELAY/1000} seconds...`);
                    await new Promise(r => setTimeout(r, this.RETRY_DELAY));
                } else {
                    console.error('Max retries reached, giving up on comment collection');
                    console.error('Last error:', lastError?.message || 'Unknown error');
                    return [];
                }
            }
        }
        return [];
    }
}


module.exports = CommentCollector;