const path = require('path');
const os = require('os');

class BrowserConfig {
    static getChromePath() {
        // 根据操作系统获取默认的Chrome路径
        const platform = os.platform();
        if (platform === 'win32') {
            // Windows系统下的默认路径
            const defaultPaths = [
                process.env.CHROME_PATH, // 首先检查环境变量
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
            ];

            // 返回第一个存在的路径
            for (const chromePath of defaultPaths) {
                if (chromePath && require('fs').existsSync(chromePath)) {
                    return chromePath;
                }
            }
        } else if (platform === 'darwin') {
            // macOS系统下的默认路径
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else if (platform === 'linux') {
            // Linux系统下的默认路径
            return '/usr/bin/google-chrome';
        }

        // 如果没有找到Chrome，返回null
        return null;
    }

    static getDefaultConfig(options = {}) {
        const chromePath = this.getChromePath();
        const defaultConfig = {
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ]
        };

        // 如果找到了Chrome路径，添加到配置中
        if (chromePath) {
            defaultConfig.executablePath = chromePath;
            defaultConfig.channel = 'chrome';
        }

        // 合并用户提供的选项
        return { ...defaultConfig, ...options };
    }

    static getSingleFileConfig(singleFileExtensionPath) {
        const baseConfig = this.getDefaultConfig();
        return {
            ...baseConfig,
            args: [
                ...baseConfig.args,
                `--load-extension=${singleFileExtensionPath}`,
                `--disable-extensions-except=${singleFileExtensionPath}`
            ]
        };
    }
}

module.exports = BrowserConfig;