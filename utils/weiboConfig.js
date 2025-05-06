const path = require('path');
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
class WeiboConfig {
    static instance = null;

    static getInstance() {
        if (!WeiboConfig.instance) {
            WeiboConfig.instance = new WeiboConfig();
        }
        return WeiboConfig.instance;
    }

    // 日期处理辅助方法
    isValidDate(dateString) {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    constructor() {
        // 参数验证
        if (argv.url && argv.keyword) {
            throw new Error('--url和--keyword参数不能同时使用');
        }
        if (!argv.mergeonly && !argv.url && !argv.keyword && !argv.input) {
            throw new Error('必须提供--keyword、--url或--input参数');
        }

        // 检查manual模式
        this.MANUAL_MODE = argv.manual || false;

        // 初始化配置流程
        this.initializeDefaultConfig();  // 设置默认配置
        this.loadConfigFromFile();       // 从文件加载配置
        this.applyCommandLineOverrides(); // 应用命令行参数覆盖

        // 初始化目录结构
        this.initializeDirectoryStructure();

        // 输出关键配置信息
        console.log(`设置MAX_ITEMS为: ${this.MAX_ITEMS}`);
        console.log(`设置NO_IMAGE为: ${this.NO_IMAGE}`);
    }

    initializeDirectoryStructure() {
        // 确保基础数据目录存在
        if (!this.DATA_DIR) {
            this.DATA_DIR = path.join(__dirname, '..', 'data');
        }
        this.DATA_DIR = path.resolve(this.DATA_DIR); // 确保路径被解析
        
        // 检查路径有效性
        if (typeof this.DATA_DIR !== 'string' || this.DATA_DIR.trim() === '') {
            throw new Error('DATA_DIR路径无效');
        }
        

        
        // 如果是mergeonly模式，只需要确保基础数据目录存在
        if (argv.mergeonly && !this.KEYWORD && !this.URL) {
            this.currentDir = this.DATA_DIR;
            return;
        }

        // 根据输入类型确定子目录
        if (this.KEYWORD) {
            // 搜索关键词模式
            this.currentDir = path.join(this.DATA_DIR, this.getPinyinDirName(this.KEYWORD));
        } else if (this.URL || argv.url) {
            // URL模式，提取用户ID
            const urlToUse = this.URL || argv.url;
            const userIdMatch = urlToUse.match(/\/u\/(\d+)/);
            if (userIdMatch) {
                this.currentDir = path.join(this.DATA_DIR, userIdMatch[1]);
            } else {
                // 如果无法提取用户ID，使用URL的哈希值作为目录名
                this.currentDir = path.join(this.DATA_DIR, 'url_' + Buffer.from(urlToUse).toString('hex').substring(0, 8));
            }
        } else {
            // 默认使用时间戳作为目录名
            this.currentDir = path.join(this.DATA_DIR, 'weibo_' + Date.now());
        }



        // 历史记录功能已移除
    }

    getDataDir() {
        return this.currentDir;
    }

    getNotePath(noteIndex) {
        return path.join(this.currentDir, `note_${noteIndex}`);

    }
    
    getPinyinDirName(keyword) {
        return keyword.replace(/[^a-zA-Z0-9]/g, '_');
    }

    // 历史记录更新功能已移除

    getMergedContentPath() {
        return path.join(this.DATA_DIR, 'merged_content.txt');
    }

    initializeDefaultConfig() {
        // 基础配置
        this.KEYWORD = null;
        this.URL = null;
        this.MAX_ITEMS = 20;
        this.NO_IMAGE = true;
        this.DATA_DIR = path.join(__dirname, '..', 'data');
        this.COOKIE_PATH = path.join(__dirname, '..', 'weibo_cookie.json');
        this.MAX_RETRIES = 3;
        this.VISIBLE_MODE = false;
        this.MANUAL_MODE = false; // 手动模式默认关闭

        // 选择器配置
        this.SELECTORS = {
            WEIBO_TEXT: [
                '.card-feed .content p[node-type="feed_list_content"]',
                '.card-feed .txt p[node-type="feed_list_content"]',
                '.card-feed .content .txt',
                '.card-feed .content p[node-type="feed_list_content_full"]',
                '.card-feed .txt[node-type="feed_list_content"]',
                '.card-feed .txt[node-type="feed_list_content_full"]',
                '.card .content p.txt[node-type="feed_list_content"]',
                '.card .content p.txt[node-type="feed_list_content_full"]',
                '.search-feed .content p[node-type="feed_list_content"]',
                '.search-feed .content p[node-type="feed_list_content_full"]',
                '.feed_list_content',
                '.WB_text',
                '.weibo-text',
                '.content',
                '.card-content',
                '.card-text',
                '.post-content',
                '.status-content',
                '.feed-content',
                '.avator + div',
                '.feed-list-item .content',
                '.card .content',
                '.card-feed .content',
                '[node-type="feed_list_content"]',
                '[node-type="feed_list_content_full"]',
                'article p',
                '.card p',
                '.list-box p'
            ],
            WEIBO_IMG: '.media-piclist img',
            NEXT_PAGE: 'a.next',
            EXPAND_BUTTONS: [
                'a.expand',
                '[role="button"][class*="expand"]',
                'div[class*="expand"][class*="text"]',
                'span[class*="expand"]',
                'div[class*="fold"]',
                'a[class*="unfold"]',
                'div[class*="unfold"]',
                'a[action-type="fl_unfold"]',
                '.card-feed a[action-type="fl_unfold"]',
                '.content p[node-type="feed_list_content"] a[action-type="fl_unfold"]',
                '.txt a[action-type="fl_unfold"]'
            ]
        };

        // 浏览器配置
        this.BROWSER_CONFIG = {
            headless: true,
            args: ['--no-sandbox', '--window-size=1400,900'],
            channel: 'chrome',
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            detached: false
        };

        // 等待时间配置
        this.WAIT_TIMES = {
            min: 1000,
            max: 2000,
            PAGE_LOAD: 8000,         // 增加页面加载等待时间
            COOKIE_INJECTION: 15000,  // 增加Cookie注入等待时间
            CONTENT_EXPANSION: 500,
            SCROLL_DELAY: 1000,
            BUTTON_RETRY_DELAY: 1500,
            ELEMENT_LOAD: 1500
        };
    }

    loadConfigFromFile() {
        // 加载全局配置
        try {
            const globalConfigPath = path.join(__dirname, '..', 'weibo_config.json');
            if (fs.existsSync(globalConfigPath)) {
                const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
                
                // 加载等待时间配置
                if (globalConfig.wait_times) {
                    // 确保所有必需的等待时间参数都被正确定义
                    const requiredWaitTimes = {
                        'PAGE_LOAD': 3000,
                        'COOKIE_INJECTION': 2000,
                        'CONTENT_EXPANSION': 1500,
                        'SCROLL_DELAY': 1500,
                        'BUTTON_RETRY_DELAY': 1000,
                        'ELEMENT_LOAD': 1000,
                        'min': 1000,
                        'max': 2000
                    };

                    // 合并配置，优先使用配置文件中的值，如果没有则使用默认值
                    this.WAIT_TIMES = {
                        ...requiredWaitTimes,
                        ...Object.fromEntries(
                            Object.entries(globalConfig.wait_times)
                                .map(([key, value]) => [key, parseInt(value)])
                        )
                    };
                }

                // 加载浏览器配置
                if (globalConfig.browser_config) {
                    Object.keys(this.BROWSER_CONFIG).forEach(key => {
                        if (globalConfig.browser_config[key] !== undefined) {
                            this.BROWSER_CONFIG[key] = globalConfig.browser_config[key];
                        }
                    });
                }

                // 加载选择器配置
                if (globalConfig.selectors) {
                    Object.keys(this.SELECTORS).forEach(key => {
                        if (globalConfig.selectors[key] !== undefined) {
                            this.SELECTORS[key] = globalConfig.selectors[key];
                        }
                    });
                }
            }
        } catch (error) {
            console.warn('加载全局配置失败:', error.message);
        }

        // 加载任务配置
        if (argv.input) {
            try {
                const inputData = JSON.parse(fs.readFileSync(argv.input, 'utf-8'));
                if (!inputData.tasks || !Array.isArray(inputData.tasks)) {
                    throw new Error('input文件格式错误：缺少tasks数组');
                }

                this.tasks = inputData.tasks;
                const currentTask = this.tasks[0];

                if (currentTask) {
                    // 加载任务特定配置
                    if (currentTask.type === 'keyword' || currentTask.type === 'wb_keyword') {
                        this.KEYWORD = currentTask.keyword;
                        // 处理日期范围
                        if (currentTask.date_range) {
                            if (this.isValidDate(currentTask.date_range.start_date)) {
                                this.START_DATE = new Date(currentTask.date_range.start_date);
                            }
                            if (this.isValidDate(currentTask.date_range.end_date)) {
                                this.END_DATE = new Date(currentTask.date_range.end_date);
                            }
                        }
                    } else if (currentTask.type === 'url' || currentTask.type === 'wb_url') {
                        this.URL = currentTask.url;
                    }

                    // 加载任务特定配置
                    if (currentTask.max_items) this.MAX_ITEMS = parseInt(currentTask.max_items);
                    if (currentTask.noimage !== undefined) this.NO_IMAGE = currentTask.noimage;

                    // 输出加载的配置信息
                    console.log('已从配置文件加载以下设置：');
                    console.log('- 任务类型:', currentTask.type);
                    console.log('- 最大条目数:', this.MAX_ITEMS);
                    console.log('- 是否不下载图片:', this.NO_IMAGE);
                    if (this.START_DATE) console.log('- 开始日期:', this.formatDate(this.START_DATE));
                    if (this.END_DATE) console.log('- 结束日期:', this.formatDate(this.END_DATE));
                }
            } catch (error) {
                throw new Error(`读取任务配置文件失败: ${error.message}`);
            }
        }
    }

    applyCommandLineOverrides() {
        // 覆盖基础配置
        if (argv.keyword) this.KEYWORD = argv.keyword;
        if (argv.url) this.URL = argv.url;
        if (argv.max_items) this.MAX_ITEMS = parseInt(argv.max_items);
        if (argv.visible !== undefined) {
            this.VISIBLE_MODE = argv.visible;
            this.BROWSER_CONFIG.headless = !this.VISIBLE_MODE;
        }
        if (argv.manual !== undefined) {
            this.MANUAL_MODE = argv.manual;
            // 在手动模式下，强制设置为可见模式
            if (this.MANUAL_MODE) {
                this.VISIBLE_MODE = true;
                this.BROWSER_CONFIG.headless = false;
            }
        }
        if (argv.noimage !== undefined) this.NO_IMAGE = argv.noimage;

        // 构建目标URL
        this.buildTargetUrl();
    }

    buildTargetUrl() {
        if (this.KEYWORD) {
            let timeScope = '';
            const currentTask = this.tasks?.find(task => 
                task.type === 'keyword' && task.keyword === this.KEYWORD
            );

            if (currentTask?.date_range) {
                const now = new Date();
                const endDate = this.isValidDate(currentTask.date_range.end_date) ? 
                    new Date(currentTask.date_range.end_date) : now;
                const startDate = this.isValidDate(currentTask.date_range.start_date) ? 
                    new Date(currentTask.date_range.start_date) : 
                    new Date(now.setDate(now.getDate() - 7));
                
                timeScope = `&timescope=custom:${this.formatDate(startDate)}:${this.formatDate(endDate)}`;
            }

            this.TARGET_URL = `https://s.weibo.com/weibo?q=${encodeURIComponent(this.KEYWORD.trim()).replace(/%20/g, '+').replace(/%2B/g, '+')}&scope=ori&suball=1${timeScope}&Refer=g`;
        } else {
            this.TARGET_URL = this.URL || 'https://weibo.com';
        }
    }
}

module.exports = WeiboConfig.getInstance();