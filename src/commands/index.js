const weiboSearch = require('./weiboSearch');
const weiboUser = require('./weiboUser');
const weiboConfig = require('../../utils/weiboConfig');
const weiboFileSystem = require('../../utils/weiboFileSystem');
const weiboBrowser = require('../../utils/weiboBrowser');

async function initialize() {
    console.log('正在初始化数据目录...');
    weiboFileSystem.ensureDir(weiboConfig.DATA_DIR);

    console.log('正在初始化浏览器...');
    await weiboBrowser.initialize();

    console.log('正在加载cookie...');
    const cookies = weiboFileSystem.readCookies(weiboConfig.COOKIE_PATH);
    await weiboBrowser.loadCookies(cookies);
}

async function cleanup() {
    if (weiboBrowser) {
        await weiboBrowser.close();
    }
}

module.exports = {
    initialize,
    cleanup,
    weiboSearch,
    weiboUser
};