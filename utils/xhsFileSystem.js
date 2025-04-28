const fs = require('fs');
const path = require('path');
const { FileSystemManager } = require('./fileSystem');

class XhsFileSystem extends FileSystemManager {
    constructor() {
        super();
        this.histories = new Map(); // 存储每个任务文件夹的历史记录
    }

    // 加载指定任务文件夹的历史记录
    loadHistory(taskDir) {
        const historyPath = path.join(taskDir, 'history.json');
        if (fs.existsSync(historyPath)) {
            try {
                const historyData = fs.readFileSync(historyPath, 'utf-8');
                const history = JSON.parse(historyData);
                this.histories.set(taskDir, history);
                return history;
            } catch (error) {
                console.error('加载历史记录失败:', error);
                return [];
            }
        }
        return [];
    }

    // 保存历史记录
    saveHistory(taskDir) {
        const historyPath = path.join(taskDir, 'history.json');
        const history = this.histories.get(taskDir) || [];
        try {
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('保存历史记录失败:', error);
        }
    }

    // 添加URL到历史记录
    addToHistory(url, folderPath, taskDir) {
        let history = this.histories.get(taskDir);
        if (!history) {
            history = [];
            this.histories.set(taskDir, history);
        }
        history.push({ url, folderPath });
        this.saveHistory(taskDir);
    }

    // 检查URL是否已访问
    isUrlVisited(url, taskDir) {
        const history = this.histories.get(taskDir) || [];
        return history.some(item => item.url === url);
    }

    // 获取指定目录下的最大笔记序号
    getMaxNoteIndex(taskDir) {
        let maxIndex = 0;
        if (fs.existsSync(taskDir)) {
            const items = fs.readdirSync(taskDir);
            items.forEach(item => {
                const match = item.match(/note_(\d+)/);
                if (match) {
                    const index = parseInt(match[1]);
                    maxIndex = Math.max(maxIndex, index);
                }
            });
        }
        return maxIndex;
    }

    // 创建笔记目录
    createNoteDirectory(taskDir, noteIndex) {
        const notePath = path.join(taskDir, `note_${noteIndex}`);
        if (!fs.existsSync(notePath)) {
            fs.mkdirSync(notePath, { recursive: true });
        }
        return notePath;
    }

    // 保存笔记内容
    saveNoteContent(noteDir, content) {
        const contentPath = path.join(noteDir, 'content.json');
        fs.writeFileSync(contentPath, JSON.stringify(content, null, 2));
        return contentPath;
    }

    // 下载图片
    async downloadImage(url, filepath) {
        const ImageDownloader = require('./imageDownloader');
        return ImageDownloader.downloadImage(url, filepath);
    }
}

module.exports = XhsFileSystem;