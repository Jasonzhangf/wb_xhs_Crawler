const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OCRProcessor = require('./ocrProcessor');
const ImageDownloader = require('./imageDownloader');

class ContentProcessor {
    static hashUrl(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    static async downloadImage(url, filepath) {
        return ImageDownloader.downloadImage(url, filepath);
    }

    static async extractTextFromImage(imagePath) {
        return OCRProcessor.extractTextFromImage(imagePath);
    }

    static async processImages(images, postDir) {
        const imageResults = [];
        const processedUrls = new Set();
        let imageIndex = 1;
        
        for (const imgUrl of images) {
            const urlHash = this.hashUrl(imgUrl);
            if (processedUrls.has(urlHash)) {
                console.log(`跳过重复图片: ${imgUrl}`);
                continue;
            }
            processedUrls.add(urlHash);
            
            const ext = path.extname(new URL(imgUrl).pathname).split('?')[0] || '.jpg';
            const imagePath = path.join(postDir, `image_${imageIndex}${ext}`);
            
            try {
                await this.downloadImage(imgUrl, imagePath);
                console.log(`正在处理图片OCR: ${imagePath}`);
                const ocrText = await this.extractTextFromImage(imagePath);
                imageResults.push({
                    path: imagePath,
                    text: ocrText
                });
                imageIndex++;
            } catch (error) {
                console.error(`处理图片失败: ${error.message}`);
            }
        }
        
        return imageResults;
    }
}

module.exports = ContentProcessor;