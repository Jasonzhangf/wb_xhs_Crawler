/**
 * 通用爬虫核心模块
 * 提供微博和小红书爬虫共用的基础功能
 */
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

class Crawler {
    constructor(options = {}) {
        this.options = {
            dataDir: 'data',
            maxItems: 20,
            noImage: false,
            ...options
        };
        
        // 解析命令行参数
        this.argv = minimist(process.argv.slice(2));
        this.visibleMode = this.argv.visible !== undefined;
        this.inputFile = this.argv.input;
    }

    /**
     * 初始化爬虫环境
     */
    async initialize() {
        // 确保数据目录存在
        this.ensureDir(path.join(process.cwd(), this.options.dataDir));
    }

    /**
     * 确保目录存在
     * @param {string} dirPath - 目录路径
     */
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 加载任务配置
     * @param {string} inputFile - 任务配置文件路径
     * @returns {Array} 任务列表
     */
    loadTasks(inputFile) {
        try {
            const tasksData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
            return tasksData.tasks || [];
        } catch (error) {
            console.error(`加载任务配置失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 创建任务目录
     * @param {string} keyword - 关键词
     * @param {number} maxItems - 最大条目数
     * @returns {string} 任务目录路径
     */
    createTaskDir(keyword, maxItems) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const taskFolderName = `${keyword}_${dateStr}_${maxItems}条`;
        const taskDir = path.join(process.cwd(), this.options.dataDir, taskFolderName);
        this.ensureDir(taskDir);
        return taskDir;
    }

    /**
     * 格式化日期
     * @param {Date} date - 日期对象
     * @returns {string} 格式化的日期字符串 (YYYY-MM-DD)
     */
    formatDate(date) {
        return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }

    /**
     * 获取日期范围
     * @param {number} days - 天数
     * @returns {Object} 开始和结束日期
     */
    getDateRange(days = 7) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        return {
            startDate: this.formatDate(startDate),
            endDate: this.formatDate(endDate)
        };
    }

    /**
     * 处理任务
     * @param {Object} task - 任务配置
     */
    async processTask(task) {
        throw new Error('子类必须实现processTask方法');
    }

    /**
     * 运行爬虫
     */
    async run() {
        try {
            await this.initialize();
            
            if (!this.inputFile) {
                throw new Error('必须提供任务配置文件');
            }
            
            const tasks = this.loadTasks(this.inputFile);
            if (tasks.length === 0) {
                console.log('没有找到任务配置');
                return;
            }
            
            for (const task of tasks) {
                await this.processTask(task);
            }
            
            console.log('所有任务处理完成');
        } catch (error) {
            console.error(`爬虫运行出错: ${error.message}`);
        }
    }
}

module.exports = Crawler;