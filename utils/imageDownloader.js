const fs = require('fs');
const fetch = require('node-fetch');

class ImageDownloader {
    static async downloadImage(url, filepath) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }
            const buffer = await response.buffer();
            await fs.promises.writeFile(filepath, buffer);
        } catch (error) {
            console.error(`下载图片失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ImageDownloader;