const BaseContentCapture = require('./baseContentCapture');

class XhsCommentExtractor extends BaseContentCapture {
    constructor(page) {
        super();
        this.page = page;
        this.commentSelector = '#noteContainer > div.interaction-container > div.note-scroller > div.comments-el > div';
        this.endSelector = '#noteContainer > div.interaction-container > div.note-scroller > div.comments-el > div > div.end-container, #noteContainer > div.interaction-container > div.note-scroller > div.comments-el > div > p';
    }

    async extractComments() {
        try {
            const allComments = new Set();
            let reachedEnd = false;
            let lastCommentCount = 0;
            let noNewCommentsCount = 0;

            while (!reachedEnd) {
                // Find and log visible comment container
                const visibleContainer = await this.page.evaluate((selector) => {
                    const container = document.querySelector(selector);
                    if (container) {
                        console.log('Found visible comment container:', selector);
                        return true;
                    }
                    return false;
                }, this.commentSelector);

                if (!visibleContainer) {
                    console.log('No visible comment container found');
                    break;
                }

                // Extract current comments
                const currentComments = await this.page.evaluate(({ commentSelector }) => {
                    const comments = [];
                    const elements = document.querySelectorAll(`${commentSelector} .content`);
                    elements.forEach(el => {
                        const text = el.textContent?.trim();
                        if (text && text.length > 0 && !text.includes('undefined') && !text.includes('[object Object]')) {
                            comments.push(text);
                        }
                    });
                    return comments;
                }, { commentSelector: this.commentSelector });

                // Add new comments to set
                currentComments.forEach(comment => allComments.add(comment));

                // Check if we've reached the end
                const endReached = await this.page.evaluate(({ container, text }) => {
                    return !!(document.querySelector(container) || document.querySelector(text));
                }, this.endSelector);

                if (endReached) {
                    console.log('Reached end of comments');
                    reachedEnd = true;
                    break;
                }

                // Check for new comments
                if (allComments.size === lastCommentCount) {
                    noNewCommentsCount++;
                    if (noNewCommentsCount >= 3) {
                        console.log('No new comments found after 3 attempts');
                        break;
                    }
                } else {
                    noNewCommentsCount = 0;
                }

                lastCommentCount = allComments.size;
                console.log(`Found ${currentComments.length} comments, total unique: ${allComments.size}`);

                // Simulate Page Down for scrolling
                await this.page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight);
                });

                // Wait for potential new comments to load
                await this.page.waitForTimeout(1000);
                            extractedComments.push(commentText);
                        }
            return Array.from(allComments);
        } catch (error) {
            console.error('Error extracting comments:', error);
            return [];
        }
    }
}

module.exports = XhsCommentExtractor;