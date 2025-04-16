const fs = require('fs');
const path = require('path');
const https = require('https');

class WeiboFileSystem {
    constructor() {
        this.DATA_DIR = 'data';
        this.visitedUrls = new Set();
        this.searchResults = [];
    }
    
    // 设置特定任务的历史记录文件路径
    setHistoryFilePath(taskDir) {
        return path.join(taskDir, 'history.json');
    }
    
    // 验证日期格式是否有效
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    // 加载特定任务的历史记录
    loadHistory(taskDir) {
        try {
            const historyFilePath = this.setHistoryFilePath(taskDir);
            if (fs.existsSync(historyFilePath)) {
                const content = fs.readFileSync(historyFilePath, 'utf-8');
                return content ? JSON.parse(content) : [];
            }
            return [];
        } catch (error) {
            console.error(`加载历史记录失败 (${taskDir}):`, error);
            return [];
        }
    }

    // 保存特定任务的历史记录
    saveHistory(taskDir, historyData) {
        try {
            const historyFilePath = this.setHistoryFilePath(taskDir);
            fs.writeFileSync(
                historyFilePath,
                JSON.stringify(historyData, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error(`保存历史记录失败 (${taskDir}):`, error);
        }
    }
    
    addToHistory(url, folderPath, taskDir) {
        // 加载特定任务的历史记录
        const history = this.loadHistory(taskDir);
        
        if (!history.some(item => item.url === url && item.folderPath === folderPath)) {
            history.push({
                url,
                folderPath,
                timestamp: new Date().toISOString()
            });
            this.saveHistory(taskDir, history);
        }
    }

    // 确保目录存在
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
    
    // 创建关键字目录
    createKeywordDir(keyword) {
        const dirPath = this.getKeywordDirPath(keyword);
        this.ensureDir(dirPath);
        return dirPath;
    }
    
    // 获取目录名
    getDirectoryName(keyword) {
        return keyword.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // 读取Cookie文件
    readCookies(cookiePath) {
        try {
            if (!fs.existsSync(cookiePath)) {
                throw new Error(`Cookie文件不存在: ${cookiePath}`);
            }
            
            const cookieData = fs.readFileSync(cookiePath, 'utf-8');
            if (!cookieData || cookieData.trim() === '') {
                throw new Error('Cookie文件为空');
            }
            
            const cookies = JSON.parse(cookieData);
            
            // 验证cookie格式
            if (!Array.isArray(cookies)) {
                throw new Error('Cookie数据格式错误：应为数组格式');
            }
            
            // 验证每个cookie对象的必要字段
            const validCookies = cookies.filter(cookie => {
                return cookie && typeof cookie === 'object' && 
                       cookie.name && cookie.value && cookie.domain;
            });
            
            console.log(`Cookie文件中包含${cookies.length}个Cookie，其中${validCookies.length}个格式有效`);
            
            if (validCookies.length === 0) {
                throw new Error('没有找到有效的Cookie');
            }
            
            return validCookies;
        } catch (error) {
            console.error(`读取Cookie文件失败: ${error.message}`);
            console.error('将尝试继续执行，但可能需要手动登录');
            return [];
        }
    }

    // 下载图片
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

    // 保存内容到JSON文件
    saveContentToJson(filePath, content) {
        try {
            fs.writeFileSync(
                filePath,
                JSON.stringify(content, null, 2),
                'utf-8'
            );
        } catch (error) {
            throw new Error(`保存内容到JSON文件失败: ${error.message}`);
        }
    }

    // 合并所有JSON文件
    getMergedFileName(keyword, count, isExport = false) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        const prefix = isExport ? '微博' : this.getPinyinDirName(keyword);
        const keywordText = isExport ? keyword : this.getPinyinDirName(keyword);
        return `${prefix}_${keywordText}_${count}条_${dateStr}${isExport ? '.md' : '.txt'}`;
    }

    mergeJsonFiles(dataDir) {
        try {
            const allContent = [];
            const files = fs.readdirSync(dataDir);
            const keyword = path.basename(dataDir);
            
            // 只处理子目录中的帖子文件夹
            for (const dir of files) {
                const dirPath = path.join(dataDir, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    const contentPath = path.join(dirPath, 'content.json');
                    if (fs.existsSync(contentPath)) {
                        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                        allContent.push(content);
                    }
                }
            }
            
            if (allContent.length > 0) {
                const mergedData = JSON.stringify(allContent, null, 2);
                
                // 在话题目录根目录创建合并文件
                const mergedFileName = this.getMergedFileName(keyword, allContent.length);
                const outputPath = path.join(dataDir, mergedFileName);
                fs.writeFileSync(outputPath, mergedData, 'utf-8');
                
                console.log(`已合并 ${allContent.length} 个JSON文件到: ${outputPath}`);
                return allContent.length;
            }
            console.log(`没有找到可合并的JSON文件`);
            return 0;
        } catch (error) {
            throw new Error(`合并JSON文件失败: ${error.message}`);
        }
    }
    
    // 获取下一个文件夹编号
    getNextFolderNumber(keywordDir) {
        try {
            const files = fs.readdirSync(keywordDir);
            const noteFolders = files.filter(f => 
                fs.statSync(path.join(keywordDir, f)).isDirectory() && 
                f.startsWith('weibo_note_')
            );
            
            if (noteFolders.length === 0) return 1;
            
            const numbers = noteFolders.map(f => {
                const match = f.match(/weibo_note_(\d+)/);
                return match ? parseInt(match[1]) : 0;
            });
            
            return Math.max(...numbers) + 1;
        } catch (error) {
            console.error('获取文件夹编号失败:', error);
            return 1;
        }
    }
    
    // 获取关键字目录路径
    getKeywordDirPath(keyword) {
        const dataDir = path.join(__dirname, '../data');
        const pinyinDirName = this.getPinyinDirName(keyword);
        return path.join(dataDir, pinyinDirName);
    }
    
    // 检查URL是否已处理
    isUrlProcessed(url, taskDir) {
        const history = this.loadHistory(taskDir);
        return history.some(item => item.url === url);
    }
    
    // 记录已处理的URL
    recordProcessedUrl(url, folderPath, taskDir) {
        const history = this.loadHistory(taskDir);
        if (!history.some(item => item.url === url)) {
            history.push({
                url,
                folderPath,
                timestamp: new Date().toISOString()
            });
            this.saveHistory(taskDir, history);
        }
    }
    
    // 读取JSON文件
    readJsonFile(filePath) {
        try {
            // 确保使用绝对路径
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            console.log(`正在读取JSON文件: ${absolutePath}`);
            const data = fs.readFileSync(absolutePath, 'utf-8');
            if (!data.trim()) {
                throw new Error('JSON文件为空');
            }
            
            // 尝试解析JSON
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (parseError) {
                console.error(`JSON解析错误: ${parseError.message}`);
                console.error(`问题文件内容: ${data.substring(0, 200)}...`);
                throw new Error(`JSON解析失败: ${parseError.message}`);
            }
            
            if (!data.trim()) {
                throw new Error('JSON文件为空');
            }
            try {
                parsed = JSON.parse(data);
            } catch (parseError) {
                console.error(`JSON解析错误: ${parseError.message}`);
                console.error(`问题文件内容: ${data.substring(0, 200)}...`);
                throw new Error(`JSON解析失败: ${parseError.message}`);
            }
            
            // 验证keywords.json文件结构
            if (path.basename(filePath) === 'keywords.json' || path.basename(filePath) === 'input.json') {
                if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
                    throw new Error('JSON文件格式错误: 缺少tasks数组');
                }
                if (parsed.tasks.length === 0) {
                    throw new Error('JSON文件格式错误: tasks数组不能为空');
                }
                for (const task of parsed.tasks) {
                    if (!task.type) {
                        throw new Error('JSON文件格式错误: 任务必须包含type字段');
                    }
                    if (task.type === 'keyword') {
                        if (!task.keyword) {
                            throw new Error('JSON文件格式错误: keyword类型任务必须包含keyword字段');
                        }
                        if (task.max_items && isNaN(Number(task.max_items))) {
                            throw new Error('JSON文件格式错误: max_items必须是数字');
                        }
                        if (task.date_range) {
                            // 如果date_range存在但字段为空，设置默认值
                            if (!task.date_range.start_date || !task.date_range.end_date) {
                                const today = new Date();
                                const sevenDaysAgo = new Date(today);
                                sevenDaysAgo.setDate(today.getDate() - 7);
                                
                                // 格式化日期为YYYY-MM-DD
                                const formatDate = (date) => {
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    return `${year}-${month}-${day}`;
                                };
                                
                                if (!task.date_range.end_date) {
                                    task.date_range.end_date = formatDate(today);
                                    console.log(`设置默认结束日期: ${task.date_range.end_date}`);
                                }
                                
                                if (!task.date_range.start_date) {
                                    task.date_range.start_date = formatDate(sevenDaysAgo);
                                    console.log(`设置默认起始日期: ${task.date_range.start_date}`);
                                }
                            }
                            
                            if (!this.isValidDate(task.date_range.start_date) || !this.isValidDate(task.date_range.end_date)) {
                                throw new Error('JSON文件格式错误: date_range中的日期格式无效');
                            }
                            if (new Date(task.date_range.start_date) > new Date(task.date_range.end_date)) {
                                throw new Error('JSON文件格式错误: start_date不能晚于end_date');
                            }
                        }
                    } else if (task.type === 'url') {
                        if (!task.url) {
                            throw new Error('JSON文件格式错误: url类型任务必须包含url字段');
                        }
                        if (task.subtype && !['user', 'post'].includes(task.subtype)) {
                            throw new Error('JSON文件格式错误: url任务的subtype必须是user或post');
                        }
                        if (task.noimage && typeof task.noimage !== 'boolean') {
                            throw new Error('JSON文件格式错误: noimage必须是布尔值');
                        }
                    } else {
                        throw new Error(`JSON文件格式错误: 未知的任务类型 ${task.type}`);
                    }
                }
            }
            
            console.log(`成功读取并验证JSON文件: ${filePath}`);
            return parsed;
        } catch (error) {
            console.error(`读取JSON文件失败: ${error.message}`);
            console.error(`文件路径: ${filePath}`);
            throw new Error(`读取JSON文件失败: ${error.message}`);
        }
    }
}

module.exports = new WeiboFileSystem();