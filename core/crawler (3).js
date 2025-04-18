/**
 * 统一爬虫入口文件
 * 支持微博和小红书平台的爬取任务
 */
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

// 解析命令行参数
const argv = minimist(process.argv.slice(2));
const inputFile = argv.input || 'tasks.json';
const platform = argv.platform || 'auto';
const visibleMode = argv.visible !== undefined;

// 打印配置信息
console.log(`使用任务配置文件: ${inputFile}`);

/**
 * 加载任务配置
 * @param {string} filePath - 任务配置文件路径
 * @returns {Array} 任务列表
 */
function loadTasks(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`任务配置文件不存在: ${filePath}`);
            return [];
        }
        
        const tasksData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return tasksData.tasks || [];
    } catch (error) {
        console.error(`加载任务配置失败: ${error.message}`);
        return [];
    }
}

/**
 * 确定任务平台类型
 * @param {Object} task - 任务配置
 * @returns {string} 平台类型 (weibo 或 xhs)
 */
function getTaskPlatform(task) {
    const type = task.type || '';
    if (type.startsWith('wb_')) {
        return 'weibo';
    } else if (type.startsWith('xhs_')) {
        return 'xhs';
    }
    return task.platform || 'unknown';
}

/**
 * 主函数
 */
async function main() {
    try {
        // 加载任务配置
        const tasks = loadTasks(inputFile);
        if (tasks.length === 0) {
            console.log('没有找到任务配置');
            return;
        }
        
        console.log(`已从配置文件加载以下设置：`);
        for (const task of tasks) {
            console.log(`- 任务类型: ${task.type}`);
            if (task.keyword) console.log(`- 关键字: ${task.keyword}`);
            if (task.max_items) console.log(`- 最大条目数: ${task.max_items}`);
            if (task.noimage !== undefined) console.log(`- 是否不下载图片: ${task.noimage}`);
        }
        
        // 处理每个任务
        for (const task of tasks) {
            const taskPlatform = platform === 'auto' ? getTaskPlatform(task) : platform;
            
            if (taskPlatform === 'weibo') {
                // 动态导入微博爬虫
                const WeiboCrawler = require('./core/platforms/weiboCrawler');
                const crawler = new WeiboCrawler({
                    visibleMode: visibleMode
                });
                await crawler.initialize();
                await crawler.processTask(task);
            } else if (taskPlatform === 'xhs') {
                // 动态导入小红书爬虫
                const XhsCrawler = require('./core/platforms/xhsCrawler');
                const crawler = new XhsCrawler({
                    visibleMode: visibleMode
                });
                await crawler.initialize();
                await crawler.processTask(task);
            } else {
                console.log(`未知平台类型: ${taskPlatform}，跳过任务`);
            }
        }
        
        console.log('所有任务处理完成');
    } catch (error) {
        console.error('程序执行出错:', error);
        process.exit(1);
    }
}

// 执行主函数
main().catch(console.error);