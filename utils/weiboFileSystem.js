const fs = require('fs');
const path = require('path');
const ImageDownloader = require('./imageDownloader');

class WeiboFileSystem {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.ensureDir(baseDir);
    }

    // Create directory for keyword results
    createKeywordDir(keyword, timestamp) {
        const dirName = `keyword_${keyword}_${timestamp}`;
        const dirPath = path.join(this.baseDir, dirName);
        this.ensureDir(dirPath);
        return dirPath;
    }

    // Create directory for user results
    createUserDir(userId, timestamp) {
        const dirName = `user_${userId}_${timestamp}`;
        const dirPath = path.join(this.baseDir, dirName);
        this.ensureDir(dirPath);
        return dirPath;
    }

    // Save content to JSON file
    saveContentToJson(filepath, content) {
        fs.writeFileSync(filepath, JSON.stringify(content, null, 2), 'utf8');
    }

    // Save summary to markdown file
    saveSummaryToMarkdown(filepath, content) {
        fs.writeFileSync(filepath, content, 'utf8');
    }

    // Save post content and download images
    async savePost(baseDir, postIndex, content) {
        const postFolder = path.join(baseDir, `post_${postIndex}`);
        this.ensureDir(postFolder);

        // Download images if present
        if (content.images && content.images.length > 0) {
            const savedImages = [];
            for (let i = 0; i < content.images.length; i++) {
                const imageUrl = content.images[i];
                const imageName = `image_${i + 1}.jpg`;
                const imagePath = path.join(postFolder, imageName);
                try {
                    await this.downloadImage(imageUrl, imagePath);
                    savedImages.push(path.join(path.basename(postFolder), imageName));
                } catch (error) {
                    console.error(`Error downloading image ${imageUrl}:`, error);
                }
            }
            content.images = savedImages;
        }

        // Save content to JSON file
        const contentPath = path.join(postFolder, 'content.json');
        this.saveContentToJson(contentPath, content);
    }

    // Ensure directory exists
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    // Download image from URL
    async downloadImage(url, filepath) {
        return ImageDownloader.downloadImage(url, filepath);
    }

    // Save posts to text file
    savePostsToFile(filepath, posts) {
        const content = JSON.stringify(posts, null, 2);
        fs.writeFileSync(filepath, content, 'utf8');
    }

    // Save summary to file
    saveSummary(filepath, summary) {
        fs.writeFileSync(filepath, summary, 'utf8');
    }

    // Read JSON file
    readJsonFile(filepath) {
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }

    // Read text file
    readTextFile(filepath) {
        return fs.readFileSync(filepath, 'utf8');
    }

    // Check if file exists
    fileExists(filepath) {
        return fs.existsSync(filepath);
    }

    // Delete file if exists
    deleteFile(filepath) {
        if (this.fileExists(filepath)) {
            fs.unlinkSync(filepath);
        }
    }

    // Get all files in directory
    getFilesInDir(dirPath) {
        return fs.readdirSync(dirPath);
    }

    // Merge JSON files and export in text/markdown formats
    static async mergeJsonFiles(taskDir, exportOptions = {}) {
        try {
            const allContent = [];
            const files = fs.readdirSync(taskDir);
            
            // Collect all post content
            for (const dir of files) {
                const dirPath = path.join(taskDir, dir);
                if (fs.statSync(dirPath).isDirectory() && dir.startsWith('post_')) {
                    const contentPath = path.join(dirPath, 'content.json');
                    if (fs.existsSync(contentPath)) {
                        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                        allContent.push(content);
                    }
                }
            }
            
            if (allContent.length > 0) {
                // Generate text format
                const txtContent = allContent.map(post => {
                    let content = `${post.text || '无内容'}\n`;
                    content += `发布时间：${post.time || '未知'}\n`;
                    content += `微博链接：${post.postUrl || '无链接'}\n`;
                    if (post.images && post.images.length > 0) {
                        content += `图片：${post.images.join(', ')}\n`;
                    }
                    if (post.ocr_results && post.ocr_results.length > 0) {
                        content += '图片文字：\n' + post.ocr_results.map(r => `- ${r.image}: ${r.text}`).join('\n') + '\n';
                    }
                    content += '---\n';
                    return content;
                }).join('\n');
                
                const txtFileName = `${path.basename(taskDir)}.txt`;
                const txtPath = path.join(taskDir, txtFileName);
                fs.writeFileSync(txtPath, txtContent, 'utf-8');
                
                // Generate markdown format
                const mdContent = allContent.map(post => {
                    let content = `${post.text || '无内容'}\n\n`;
                    content += `**发布时间**：${post.time || '未知'}\n\n`;
                    if (post.images && post.images.length > 0) {
                        content += '**图片**：\n\n';
                        post.images.forEach(img => {
                            content += `![](${img})\n\n`;
                        });
                    }
                    if (post.ocr_results && post.ocr_results.length > 0) {
                        content += '**图片文字**：\n\n' + post.ocr_results.map(r => `* ${r.image}：${r.text}`).join('\n') + '\n\n';
                    }
                    content += `[原文链接](${post.postUrl || '#'})\n\n---\n\n`;
                    return content;
                }).join('');
                
                const mdFileName = `${path.basename(taskDir)}.md`;
                const mdPath = path.join(taskDir, mdFileName);
                fs.writeFileSync(mdPath, mdContent, 'utf-8');
                
                // Handle export if specified
                if (exportOptions && exportOptions.path) {
                    const exportDir = path.join(process.cwd(), exportOptions.path);
                    fs.mkdirSync(exportDir, { recursive: true });
                    
                    if (!exportOptions.format || exportOptions.format === 'all') {
                        fs.copyFileSync(txtPath, path.join(exportDir, txtFileName));
                        fs.copyFileSync(mdPath, path.join(exportDir, mdFileName));
                    } else if (exportOptions.format === 'txt') {
                        fs.copyFileSync(txtPath, path.join(exportDir, txtFileName));
                    } else if (exportOptions.format === 'md') {
                        fs.copyFileSync(mdPath, path.join(exportDir, mdFileName));
                    }
                }
                
                console.log(`已合并 ${allContent.length} 条微博到：\n- ${txtPath}\n- ${mdPath}`);
                return allContent.length;
            }
            
            console.log('没有找到可合并的微博内容');
            return 0;
        } catch (error) {
            console.error(`合并文件失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = WeiboFileSystem;