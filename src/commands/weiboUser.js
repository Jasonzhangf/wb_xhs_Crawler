const weiboConfig = require('../../utils/weiboConfig');
const weiboFileSystem = require('../../utils/weiboFileSystem');
const weiboBrowser = require('../../utils/weiboBrowser');
const ocrProcessor = require('../../utils/ocrProcessor');
const path = require('path');

async function processWeiboPost(element, noteDir, processedCount) {
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

        console.log(`已处理 ${processedCount}/${weiboConfig.MAX_ITEMS} 条微博`);
    } catch (error) {
        console.error(`处理微博内容失败: ${error.message}`);
    }
}

async function crawlUserPage(userUrl, maxItems = weiboConfig.MAX_ITEMS) {
    console.log(`开始爬取用户页面: ${userUrl}`);
    let processedCount = 0;
    let lastHeight = 0;

    // 导航到用户页面
    await weiboBrowser.navigateToPage(userUrl);
    await weiboBrowser.randomWait(weiboConfig.WAIT_TIMES.page_load);

    const userId = userUrl.split('/').pop();
    const userDir = path.join(weiboConfig.DATA_DIR, `user_${userId}`);
    weiboFileSystem.ensureDir(userDir);

    while (processedCount < maxItems) {
        // 点击展开按钮
        await weiboBrowser.clickExpandButtons();
        await weiboBrowser.randomWait(weiboConfig.WAIT_TIMES.element_load);

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

            const noteDir = path.join(userDir, `weibo_note_${weiboFileSystem.getNextFolderNumber(userDir)}`);
            weiboFileSystem.ensureDir(noteDir);
            await processWeiboPost(element, noteDir, processedCount + 1);
            weiboFileSystem.recordProcessedUrl(element.text, noteDir);
            processedCount++;
        }

        // 滚动页面
        const currentHeight = await weiboBrowser.scrollPage();
        if (currentHeight === lastHeight) {
            console.log('已到达页面底部');
            break;
        }
        lastHeight = currentHeight;
    }

    // 合并JSON文件
    console.log(`开始合并用户${userId}的JSON文件...`);
    const mergedCount = weiboFileSystem.mergeJsonFiles(userDir);
    console.log(`已合并 ${mergedCount} 个JSON文件`);
}

module.exports = {
    crawlUserPage
};