const weiboConfig = require('../../utils/weiboConfig');
const weiboFileSystem = require('../../utils/weiboFileSystem');
const weiboBrowser = require('../../utils/weiboBrowser');
const ocrProcessor = require('../../utils/ocrProcessor');
const path = require('path');

async function processWeiboPost(element, noteDir, processedCount, maxItems) {
    try {
        const content = {
            text: element.text,
            images: [],
            ocr_results: []
        };

        // 下载图片并进行OCR处理
        for (let [imgIndex, imgUrl] of element.imgUrls.entries()) {
            try {
                const imgPath = path.join(noteDir, `image_${imgIndex + 1}.jpg`);
                await weiboFileSystem.downloadImage(imgUrl, imgPath);
                console.log(`已下载图片: ${imgPath}`);

                // OCR处理
                const ocrResult = await ocrProcessor.extractTextFromImage(imgPath);
                if (ocrResult) {
                    content.images.push(imgPath);
                    content.ocr_results.push(ocrResult);
                }
            } catch (error) {
                console.error(`处理图片失败: ${error.message}`);
            }
        }

        // 保存内容到JSON文件
        weiboFileSystem.saveContentToJson(
            path.join(noteDir, 'content.json'),
            content
        );

        console.log(`已处理 ${processedCount}/${maxItems} 条微博`);
    } catch (error) {
        console.error(`处理微博内容失败: ${error.message}`);
    }
}

function buildSearchUrl(keyword, page = 1, startDate = '', endDate = '') {
    // 处理关键字，移除多余空格并优化中英文混合
    const processedKeyword = keyword.trim().replace(/\s+/g, '+');
    let url = `https://s.weibo.com/weibo?q=${encodeURIComponent(processedKeyword)}&xsort=hot&suball=1&Refer=g&page=${page}`;
    console.log(`使用的关键字: ${processedKeyword}`);
    
    // 添加时间范围参数
    if (startDate && endDate) {
        url += `&timescope=custom:${startDate}:${endDate}`;
    } else {
        // 默认搜索日期范围为最近7天
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        url += `&timescope=custom:${startDate.toISOString().split('T')[0]}:${endDate}`;
    }
    
    // 确保URL编码正确
    url = url.replace(/%2B/g, '+');
    //console.log(`生成的搜索URL: ${url}`);
    return url;
}

async function searchByKeyword(keywordConfig) {
    // 从命令行参数、任务配置或默认值中获取max_items
    const argv = require('minimist')(process.argv.slice(2));
    const cmdMaxItems = argv.max_items ? parseInt(argv.max_items) : null;
    const { keyword, max_items: configMaxItems, wait_times: waitTimes } = keywordConfig;
    const maxItems = cmdMaxItems || configMaxItems || 20;
    
    console.log(`开始处理关键字: ${keyword}，最大爬取数量: ${maxItems}`);
    let processedCount = 0;
    let lastHeight = 0;
    let hasNextPage = true;
    let page = 1;

    const keywordDir = weiboFileSystem.createKeywordDir(keyword);

    while (processedCount < maxItems && hasNextPage) {
        console.log(`正在处理第${page}页...`);
        
        // 构建搜索URL并导航
        const searchUrl = buildSearchUrl(keyword, page);
        const navigationSuccess = await weiboBrowser.navigateToPage(searchUrl);
 
        await weiboBrowser.randomWait(waitTimes.page_load);

        // 点击展开按钮
        await weiboBrowser.clickExpandButtons();
        await weiboBrowser.randomWait(waitTimes.element_load);

        // 获取微博内容
        const weiboElements = await weiboBrowser.getWeiboContent();
        console.log(`获取到${weiboElements.length}条微博内容`);

        // 处理每个微博内容
        for (const element of weiboElements) {
            if (processedCount >= maxItems) break;

            if (weiboFileSystem.isUrlProcessed(element.text)) {
                console.log(`跳过已处理的URL: ${element.text}`);
                continue;
            }

            const noteDir = path.join(keywordDir, `weibo_note_${weiboFileSystem.getNextFolderNumber(keywordDir)}`);
            weiboFileSystem.ensureDir(noteDir);
            await processWeiboPost(element, noteDir, processedCount + 1, maxItems);
            weiboFileSystem.recordProcessedUrl(element.text, noteDir);
            processedCount++;
        }

        // 检查是否有下一页
        hasNextPage = await weiboBrowser.clickNextPage();
        if (!hasNextPage) {
            console.log('没有更多页面了，准备结束当前关键字的处理');
            // 合并当前关键字的JSON文件
            console.log(`开始合并${keyword}的JSON文件...`);
            const mergedCount = weiboFileSystem.mergeJsonFiles(keywordDir);
            console.log(`已合并 ${mergedCount} 个JSON文件`);
            break;
        }
        page++;
    }

    // 合并当前关键字的JSON文件
    console.log(`开始合并${keyword}的JSON文件...`);
    const mergedCount = weiboFileSystem.mergeJsonFiles(keywordDir);
    console.log(`已合并 ${mergedCount} 个JSON文件`);
}

async function searchByKeywords(keywordsConfig) {
    for (const keywordConfig of keywordsConfig.keywords) {
        await searchByKeyword(keywordConfig);
    }
    console.log('所有关键字处理完成');
}

module.exports = {
    searchByKeyword,
    searchByKeywords
};