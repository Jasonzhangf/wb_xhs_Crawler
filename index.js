const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 在开发模式下加载Vite开发服务器URL
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    // 在生产模式下加载打包后的index.html
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 验证cookie
async function validateCookie(platform, cookiePath) {
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
      channel: 'chrome',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });

    const page = await browser.newPage();
    for (const cookie of cookies) {
      await page.setCookie(cookie);
    }

    const url = platform === 'weibo' ? 'https://weibo.com' : 'https://www.xiaohongshu.com';
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);

    // 检查登录状态
    const isLoggedIn = platform === 'weibo' ?
      await page.$('.woo-font--profile') !== null :
      await page.$('.login-button') === null;

    await browser.close();
    return isLoggedIn;
  } catch (error) {
    console.error('验证cookie时出错:', error);
    return false;
  }
}

// IPC通信处理
ipcMain.handle('validate-cookie', async (event, { platform }) => {
  const cookiePath = platform === 'weibo' ? 'weibo_cookie.json' : 'xiaohongshu_cookie.json';
  return await validateCookie(platform, cookiePath);
});

ipcMain.handle('start-crawler', async (event, { platform, params }) => {
  const scriptPath = platform === 'weibo' ? 'weibo_crawler.js' : 'xhs_crawler.js';
  const args = Object.entries(params).map(([key, value]) => `--${key}=${value}`);
  
  const crawler = spawn('node', [scriptPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  crawler.stdout.on('data', (data) => {
    mainWindow.webContents.send('crawler-progress', data.toString());
  });

  crawler.stderr.on('data', (data) => {
    mainWindow.webContents.send('crawler-error', data.toString());
  });

  crawler.on('close', (code) => {
    mainWindow.webContents.send('crawler-finished', code);
  });

  return { success: true };
});