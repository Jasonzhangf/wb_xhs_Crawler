const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const OCRProcessor = require('../../utils/ocrProcessor');
const WeiboBrowserCore = require('../../utils/browser/weiboBrowserCore');

class WeiboCrawler {
    constructor(options = {}) {
        this.visibleMode = options.visibleMode || false;
        this.maxItems = options.maxItems || 200;
        this.noImage = options.noImage || false;
        this.cookiePath = options.cookiePath || path.join(process.cwd(), 'weibo_cookie.json');
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        try {
            const browserCore = new WeiboBrowserCore({
                visibleMode: this.visibleMode
            });
            await browserCore.initialize();
            this.browser = browserCore.browser;
            this.page = browserCore.page;
            
            // 监听视窗大小变化
            this.page.on('resize', async () => {
                const dimensions = await this.page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight
                }));
                await this.page.setViewport({
                    ...dimensions,
                    deviceScaleFactor: 1
                });
            });

            await this.loadCookies();
        } catch (error) {
            console.error('初始化浏览器失败:', error);
            throw error;
        }
    }

    async loadCookies() {
        try {
            const cookies = JSON.parse(fs.readFileSync(this.cookiePath, 'utf8'));
            await this.page.setCookie(...cookies);
        } catch (error) {
            console.error('加载Cookie失败:', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async processImages(post, postDir, taskDir) {
        if (!post.images || post.images.length === 0) return;

        if (!this.noImage) {
            const downloadedImages = [];
            const ocrResults = [];
            
            for (let i = 0; i < post.images.length; i++) {
                try {
                    const imgUrl = post.images[i];
                    const imgPath = path.join(postDir, `image_${i + 1}.jpg`);
                    const response = await fetch(imgUrl);
                    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                    const buffer = await response.buffer();
                    fs.writeFileSync(imgPath, buffer);
                    downloadedImages.push(path.relative(taskDir, imgPath));

                    const ocrText = await OCRProcessor.extractTextFromImage(imgPath, this.noImage);
                    if (ocrText) {
                        ocrResults.push({
                            image: path.relative(taskDir, imgPath),
                            text: ocrText
                        });
                    }
                } catch (error) {
                    console.error(`Failed to download image: ${error.message}`);
                }
            }
            
            post.images = downloadedImages;
            if (ocrResults.length > 0) {
                post.ocr_results = ocrResults;
            }
        } else {
            console.log('noImage is true, skipping image download and OCR processing');
            post.images = post.images.map(url => url);
        }
    }

    async processTask(task) {
        throw new Error('子类必须实现processTask方法');
    }
}

module.exports = WeiboCrawler;
