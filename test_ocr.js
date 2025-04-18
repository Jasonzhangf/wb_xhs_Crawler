const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const OCRProcessor = require('./utils/ocrProcessor');

// 测试OCR处理函数
async function testOCR() {
    console.log('===== OCR处理测试开始 =====');
    
    // 测试图片路径（包含中文）
    const testImagePath = 'd:\\github\\weiboCrawler\\data\\xhs\\美国关税\\note_1\\image_1.jpg';
    
    // 检查文件是否存在
    if (fs.existsSync(testImagePath)) {
        console.log(`测试图片存在: ${testImagePath}`);
        console.log(`图片大小: ${fs.statSync(testImagePath).size} 字节`);
    } else {
        console.error(`测试图片不存在: ${testImagePath}`);
        return;
    }
    
    try {
        console.log('开始OCR处理流程...');
        const ocrResult = await OCRProcessor.extractTextFromImage(testImagePath);
        
        console.log('===== OCR处理结果 =====');
        console.log(ocrResult ? ocrResult : '无OCR结果');
        console.log('===== OCR处理测试完成 =====');
    } catch (error) {
        console.error('OCR处理测试失败:', error);
    }
}

// 执行测试
testOCR();