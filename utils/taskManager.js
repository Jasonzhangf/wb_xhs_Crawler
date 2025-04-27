const fs = require('fs');
const path = require('path');

class TaskManager {
    constructor() {
        this.baseDir = path.join(process.cwd(), 'data');
    }

    checkTaskExists(platform, taskName) {
        const taskPath = path.join(this.baseDir, platform, taskName);
        return fs.existsSync(taskPath);
    }

    verifyHistory(taskDir) {
        const historyFile = path.join(taskDir, 'history.json');
        let history = { urls: [] };

        if (fs.existsSync(historyFile)) {
            try {
                history = JSON.parse(fs.readFileSync(historyFile));
                if (Array.isArray(history.urls)) {
                    // Verify each URL's folder exists
                    history.urls = history.urls.filter(url => {
                        const postId = url.match(/\/\d+\/([A-Za-z0-9]+)/)?.[1];
                        if (!postId) return false;
                        
                        const possibleDirs = fs.readdirSync(taskDir)
                            .filter(dir => dir.startsWith('post_'))
                            .map(dir => path.join(taskDir, dir));
                            
                        return possibleDirs.some(dir => {
                            try {
                                const content = JSON.parse(fs.readFileSync(path.join(dir, 'content.json')));
                                return content.postUrl === url;
                            } catch {
                                return false;
                            }
                        });
                    });
                    
                    // Save cleaned history
                    fs.writeFileSync(historyFile, JSON.stringify({ urls: history.urls }, null, 2));
                }
            } catch (error) {
                console.error('Error verifying history:', error);
                history = { urls: [] };
            }
        }

        return history;
    }

    getNextFolderIndex(taskDir) {
        if (!fs.existsSync(taskDir)) {
            return 1;
        }

        const folders = fs.readdirSync(taskDir)
            .filter(dir => dir.startsWith('post_'))
            .map(dir => parseInt(dir.replace('post_', '')))
            .filter(num => !isNaN(num));

        return folders.length > 0 ? Math.max(...folders) + 1 : 1;
    }

    generateTaskFolderName(platform, task) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;

        if (platform === 'weibo') {
            if (task.keyword) {
                return `weibo_${task.keyword}_${dateStr}`;
            } else if (task.user_id || task.url) {
                return `wb_user_${task.user_id || 'url'}_${dateStr}`;
            }
        } else if (platform === 'xhs') {
            if (task.keyword) {
                return `xhs_${task.keyword}_${dateStr}`;
            }
        }

        throw new Error('Invalid task type or platform');
    }

    createTaskDirectory(platform, taskName) {
        const taskDir = path.join(this.baseDir, platform, taskName);
        fs.mkdirSync(taskDir, { recursive: true });
        return taskDir;
    }

    mergeJsonFiles(taskDir) {
        const posts = [];
        const folders = fs.readdirSync(taskDir)
            .filter(dir => dir.startsWith('post_'))
            .map(dir => path.join(taskDir, dir));

        for (const folder of folders) {
            const contentFile = path.join(folder, 'content.json');
            if (fs.existsSync(contentFile)) {
                try {
                    const content = JSON.parse(fs.readFileSync(contentFile));
                    posts.push(content);
                } catch (error) {
                    console.error(`Error reading content from ${contentFile}:`, error);
                }
            }
        }

        return posts;
    }
}

module.exports = TaskManager;