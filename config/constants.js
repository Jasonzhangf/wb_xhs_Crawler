const path = require('path');

module.exports = {
    DATA_DIR: path.join(__dirname, '../data'),
    COOKIE_PATHS: {
        WEIBO: path.join(__dirname, '../weibo_cookie.json'),
        XIAOHONGSHU: path.join(__dirname, '../xiaohongshu_cookie.json')
    },
    BROWSER_CONFIG: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    },
    WAIT_TIMES: {
        page_load: 3000,
        element_load: 2000
    },
    MAX_ITEMS: 20,
    SELECTORS: {
        WEIBO: {
            post: '.WB_feed_type',
            content: '.WB_text',
            images: '.WB_pic img'
        },
        XIAOHONGSHU: {
            dataV: '[data-v-]',
            noteItem: '.note-item',
            content: '.content',
            images: '.image-container img'
        }
    }
};