const path = require('path');

class WeiboUserCapture {
    constructor(page, fileSystem) {
        this.page = page;
        this.fileSystem = fileSystem;
    }

    async captureUsername() {
        try {
            const username = await this.page.evaluate(() => {
                const usernameElement = document.querySelector('.ProfileHeader_name_1KbBs');
                return usernameElement ? usernameElement.textContent.trim() : null;
            });
            return username;
        } catch (error) {
            console.error('Error capturing username:', error);
            return null;
        }
    }

    async observeCurrentPage() {
        try {
            return await this.page.evaluate(() => {
                const elements = {
                    typeA: Array.from(document.querySelectorAll('.expand')),
                    typeB: Array.from(document.querySelectorAll('.Feed_body_3R0rO')),
                    typeC: Array.from(document.querySelectorAll('.comment-content')),
                    typeD: Array.from(document.querySelectorAll('.comment-detail')),
                    typeE: Array.from(document.querySelectorAll('.more-comment')),
                    typeF: Array.from(document.querySelectorAll('.back-to-feed'))
                };
                return {
                    hasTypeA: elements.typeA.length > 0,
                    hasTypeB: elements.typeB.length > 0,
                    hasTypeC: elements.typeC.length > 0,
                    hasTypeD: elements.typeD.length > 0,
                    hasTypeE: elements.typeE.length > 0,
                    hasTypeF: elements.typeF.length > 0,
                    elements: elements
                };
            });
        } catch (error) {
            console.error('Error observing page:', error);
            return null;
        }
    }

    async processTypeAElements() {
        try {
            const expandButtons = await this.page.$$('.expand');
            for (const button of expandButtons) {
                await button.click();
                await this.page.waitForTimeout(1000);
            }
            return true;
        } catch (error) {
            console.error('Error processing Type A elements:', error);
            return false;
        }
    }

    async capturePostContent(element) {
        try {
            return await this.page.evaluate((el) => {
                const textElement = el.querySelector('.detail_wbtext_4CRf9');
                const timeElement = el.querySelector('a[title^="2025-"]');
                const postLink = el.querySelector('a[href^="https://weibo.com/"]');
                const videoElement = el.querySelector('.wbpv-poster');
                const imageElements = Array.from(el.querySelectorAll('img.picture_focusImg_1z5In'));

                const images = imageElements.map(img => img.src);
                const videoUrl = videoElement ? videoElement.style.backgroundImage.match(/url\("(.+?)"\)/)?.[1] : null;

                return {
                    text: textElement ? textElement.textContent.trim() : '',
                    time: timeElement ? timeElement.getAttribute('title') : '',
                    postUrl: postLink ? postLink.href : '',
                    videoUrl,
                    images
                };
            }, element);
        } catch (error) {
            console.error('Error capturing post content:', error);
            return null;
        }
    }

    async captureUserPosts(maxItems, taskFolder, noimage = false) {
        console.log('Starting to capture user posts...');
        let capturedCount = 0;
        let lastHeight = 0;
        let currentPostNumber = await this.fileSystem.getCurrentPostNumber(taskFolder);

        while (capturedCount < maxItems) {
            // First observe the current page state
            const pageState = await this.observeCurrentPage();
            if (!pageState) continue;

            // Process Type A elements first
            if (pageState.hasTypeA) {
                await this.processTypeAElements();
                continue;
            }

            // Process Type B elements
            if (pageState.hasTypeB) {
                for (const post of pageState.elements.typeB) {
                    if (capturedCount >= maxItems) break;

                    try {
                        // Capture post content
                        const content = await this.capturePostContent(post);
                        if (!content) continue;

                        // Create post folder and save content
                        currentPostNumber++;
                        const postFolder = path.join(taskFolder, `post_${currentPostNumber}`);
                        await this.fileSystem.savePostContent(postFolder, content, noimage);

                        capturedCount++;
                        console.log(`Captured post ${currentPostNumber}`);
                    } catch (error) {
                        console.error('Error processing post:', error);
                        continue;
                    }
                }
            }

            if (capturedCount >= maxItems) break;

            // Scroll to load more content
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await this.page.waitForTimeout(2000);

            const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === lastHeight) {
                console.log('Reached bottom of page');
                break;
            }
            lastHeight = currentHeight;
        }

        return capturedCount;
    }
}

module.exports = WeiboUserCapture;