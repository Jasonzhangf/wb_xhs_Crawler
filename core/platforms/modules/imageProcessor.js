const path = require('path');
const fs = require('fs');
const https = require('https');
const OCRProcessor = require('../../../utils/ocrProcessor');

class ImageProcessor {
    constructor(browser, options = {}) {
        this.browser = browser;
        this.POST_DETAIL_IMAGE_SELECTOR = 'div.swiper-slide img.note-slider-img';
    }

    async downloadImage(url, filepath) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(filepath);
            https.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlink(filepath, () => {});
                reject(err);
            });
        });
    }

    async processImages(noteDir, noimage = false) {
        try {
            const imageUrls = await this.browser.page.evaluate((selector) => {
                const imgs = Array.from(document.querySelectorAll(selector));
                return imgs.map(img => img.src).filter(src => src && src.startsWith('http'));
            }, this.POST_DETAIL_IMAGE_SELECTOR);

            if (imageUrls.length === 0) {
                return { images: [], ocr_texts: [] };
            }

            console.log(`Found ${imageUrls.length} images`);
            const seenUrls = new Set();
            const uniqueImageUrls = imageUrls.filter(url => {
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    return true;
                }
                return false;
            });

            const images = [];
            const ocr_texts = [];

            for (let i = 0; i < uniqueImageUrls.length; i++) {
                try {
                    const imgUrl = uniqueImageUrls[i];
                    const imgPath = path.join(noteDir, `image_${i + 1}.jpg`);
                    await this.downloadImage(imgUrl, imgPath);
                    
                    // Store relative path using forward slashes for cross-platform compatibility
                    const relativePath = path.relative(process.cwd(), imgPath).replace(/\\/g, '/');
                    images.push(relativePath);
                    console.log(`Downloaded image: ${imgPath}`);

                    // Only process OCR if noimage is false
                    if (!noimage) {
                        const ocrText = await OCRProcessor.extractTextFromImage(imgPath);
                        if (ocrText) {
                            ocr_texts.push({
                                image_index: i + 1,
                                text: ocrText
                            });
                            console.log(`Image ${i + 1} OCR completed`);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to process image: ${error.message}`);
                }
            }

            return { images, ocr_texts };
        } catch (error) {
            console.error('Error processing images:', error);
            return { images: [], ocr_texts: [] };
        }
    }
}

module.exports = ImageProcessor;