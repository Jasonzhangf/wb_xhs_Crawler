const fs = require('fs');
const path = require('path');

class TaskManager {
    constructor() {
        this.processedUrls = new Set();
    }

    generateTaskFolderName(platform, task) {
        const date = new Date();
        const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        
        let taskName = '';
        if (task.type === 'wb_keyword') {
            taskName = `weibo_${task.keyword}_${dateStr}`;
        } else if (task.type === 'wb_user') {
            const userName = task.user_id || 'user';
            taskName = `wb_user_${userName}_${dateStr}`;
        }
        
        return taskName;
    }

    createTaskDirectory(platform, taskFolderName) {
        const taskDir = path.join(process.cwd(), 'data', platform, taskFolderName);
        if (!fs.existsSync(taskDir)) {
            fs.mkdirSync(taskDir, { recursive: true });
        }
        return taskDir;
    }

    checkTaskExists(platform, taskFolderName) {
        const taskDir = path.join(process.cwd(), 'data', platform, taskFolderName);
        return fs.existsSync(taskDir);
    }

    verifyHistory(taskDir) {
        const historyFile = path.join(taskDir, 'history.json');
        let history = { urls: [] };

        if (fs.existsSync(historyFile)) {
            try {
                const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
                // 验证每个URL对应的文件夹是否存在
                history.urls = historyData.urls.filter(url => {
                    const postDirs = fs.readdirSync(taskDir)
                        .filter(dir => dir.startsWith('post_'))
                        .map(dir => path.join(taskDir, dir));
                    
                    // 检查是否至少有一个文件夹包含这个URL的内容
                    return postDirs.some(dir => {
                        const contentFile = path.join(dir, 'content.json');
                        if (fs.existsSync(contentFile)) {
                            try {
                                const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
                                return content.postUrl === url;
                            } catch (e) {
                                return false;
                            }
                        }
                        return false;
                    });
                });
            } catch (error) {
                console.error('读取历史记录失败:', error);
                history = { urls: [] };
            }
        }

        // 保存清理后的历史记录
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
        return history;
    }

    getNextFolderIndex(taskDir) {
        if (!fs.existsSync(taskDir)) {
            return 1;
        }

        const postDirs = fs.readdirSync(taskDir)
            .filter(dir => dir.startsWith('post_'))
            .map(dir => parseInt(dir.replace('post_', '')))
            .filter(num => !isNaN(num));

        return postDirs.length > 0 ? Math.max(...postDirs) + 1 : 1;
    }

    mergeJsonFiles(taskDir) {
        const postDirs = fs.readdirSync(taskDir)
            .filter(dir => dir.startsWith('post_'))
            .map(dir => path.join(taskDir, dir));

        const mergedData = [];
        for (const dir of postDirs) {
            const contentFile = path.join(dir, 'content.json');
            if (fs.existsSync(contentFile)) {
                try {
                    const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
                    mergedData.push(content);
                } catch (error) {
                    console.error(`合并文件 ${contentFile} 失败:`, error);
                }
            }
        }

        return mergedData;
    }
}

module.exports = TaskManager;