const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const WeiboUserCrawler = require('./core/platforms/weiboUserCrawler');
const WeiboKeywordCrawler = require('./core/platforms/weiboKeywordCrawler');
const XhsKeywordCrawler = require('./core/platforms/xhsKeywordCrawler.js');

// 解析命令行参数
const argv = yargs
    .option('input', {
        alias: 'i',
        describe: '任务配置文件路径',
        type: 'string',
        demandOption: true
    })
    .option('visible', {
        describe: '是否显示浏览器界面',
        type: 'boolean',
        default: false
    })
    .help()
    .argv;

// 读取任务配置文件
const loadTasks = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const tasksData = JSON.parse(content);
        if (!tasksData || !tasksData.tasks || !Array.isArray(tasksData.tasks)) {
            console.error('任务配置格式不正确，应为包含tasks数组的对象');
            process.exit(1);
        }
        return tasksData.tasks;
    } catch (error) {
        console.error(`读取任务配置文件失败: ${error.message}`);
        process.exit(1);
    }
};

// 主函数
async function main() {
    const tasks = loadTasks(argv.input);
    
    for (const task of tasks) {
        let crawler;
        const options = {
            visibleMode: argv.visible,
            cookiePath: path.join(__dirname, 'weibo_cookie.json'),
            outputDir: path.join(__dirname, 'data')
        };

        try {
            switch (task.type) {
                case 'wb_user':
                    crawler = new WeiboUserCrawler(options);
                    await crawler.initialize();
                    await crawler.processTask(task);
                    await crawler.close();
                    break;
                case 'wb_keyword':
                    crawler = new WeiboKeywordCrawler(options);
                    await crawler.initialize();
                    await crawler.processTask(task);
                    await crawler.close();
                    break;
                case 'xhs_keyword':
                    crawler = new XhsKeywordCrawler({
                        visibleMode: argv.visible,
                        cookiePath: path.join(__dirname, 'xiaohongshu_cookie.json'),
                        outputDir: path.join(__dirname, 'data')
                    });
                    await crawler.initialize();
                    await crawler.processTask(task);
                    await crawler.close();
                    break;
                default:
                    console.error(`不支持的任务类型: ${task.type}`);
                    continue;
            }
        } catch (error) {
            console.error(`任务执行失败: ${error.message}`);
            if (error.stack) {
                console.error('错误堆栈:', error.stack);
            }
            if (crawler) {
                await crawler.close();
            }
        }
    }
}

// 运行主函数
main().catch(error => {
    console.error(`程序执行失败: ${error.message}`);
    process.exit(1);
});
