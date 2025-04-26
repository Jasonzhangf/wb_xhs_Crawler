const path = require('path');
const { spawn } = require('child_process');

class OCRProcessor {
    static async extractTextFromImage(imagePath, noimage = false) {
        // 如果noimage为true，直接返回null，不执行任何OCR相关操作
        if (noimage) {
            console.log('noimage为true，跳过OCR处理');
            return null;
        }

        return new Promise((resolve, reject) => {
            // 检查文件是否存在
            if (!require('fs').existsSync(imagePath)) {
                console.error(`OCR处理失败: 图片文件不存在 ${imagePath}`);
                resolve('');
                return;
            }

            // 确保路径使用正确的分隔符
            const normalizedPath = imagePath.replace(/\\/g, '/');
            // 检查路径是否为相对路径（以data/开头）
            const absolutePath = normalizedPath.startsWith('data/') 
                ? path.resolve(process.cwd(), normalizedPath) 
                : path.resolve(normalizedPath);
            console.log('开始OCR处理，图片路径:', absolutePath);
            
            // 再次检查文件是否存在
            if (!require('fs').existsSync(absolutePath)) {
                console.error(`OCR处理失败: 处理后的图片文件不存在 ${absolutePath}`);
                resolve('');
                return;
            }

            const pythonScript = `
import easyocr
import sys
import os
import io
import traceback
import json
import cv2
import numpy as np

# 设置标准输出为UTF-8编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "未提供图片路径参数"}), file=sys.stderr)
        sys.exit(1)
    
    image_path_arg = sys.argv[1]
    print(f"处理图片路径: {image_path_arg}", file=sys.stderr)
    
    # 检查文件是否存在
    if not os.path.exists(image_path_arg):
        print(json.dumps({"error": f"图片文件不存在: {image_path_arg}"}), file=sys.stderr)
        sys.exit(1)
    else:
        print(f"图片文件存在，大小: {os.path.getsize(image_path_arg)} 字节", file=sys.stderr)
    
    try:
        # 使用OpenCV读取图片，以二进制方式处理，避免中文路径问题
        with open(image_path_arg, 'rb') as f:
            img_data = np.frombuffer(f.read(), np.uint8)
            img = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
        
        if img is None:
            print(json.dumps({"error": f"无法读取图片: {image_path_arg}"}), file=sys.stderr)
            sys.exit(1)
            
        print(f"图片读取成功，尺寸: {img.shape}", file=sys.stderr)
        
        # 使用EasyOCR处理图片
        print("开始OCR识别...", file=sys.stderr)
        reader = easyocr.Reader(['ch_sim','en'], gpu=False)
        result = reader.readtext(img)
        print(f"OCR识别完成，识别到 {len(result)} 个文本区域", file=sys.stderr)
        
    except Exception as e:
        error_message = f"读取或处理图片失败: {str(e)}"
        print(json.dumps({"error": error_message}), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
        
    if not result:
        print(json.dumps({"text": "", "debug": "OCR未识别到任何文字"}))
        sys.exit(0)
    
    text_parts = [item[1] for item in result if item and len(item) > 1]
    if text_parts:
        text = ' '.join(text_parts)  # Using space instead of newline for safer text handling
        print(json.dumps({"text": text, "debug": f"成功识别 {len(text_parts)} 个文本区域"}))
        sys.exit(0)
    else:
        print(json.dumps({"text": "", "debug": "OCR结果格式无效"}))
        sys.exit(0)
except Exception as e:
    error_message = f"未预期的错误: {str(e)}"
    print(json.dumps({"error": error_message}), file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
`;

            const pythonProcess = spawn('python', ['-c', pythonScript, absolutePath], {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let outputData = '';
            let errorData = '';

            pythonProcess.stdout.setEncoding('utf-8');
            pythonProcess.stderr.setEncoding('utf-8');

            pythonProcess.stdout.on('data', (data) => {
                outputData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                try {
                    const errJson = JSON.parse(data.toString());
                    if (errJson && errJson.error) {
                        errorData += errJson.error + '\n';
                    } else {
                        errorData += data.toString();
                    }
                } catch (e) {
                    errorData += data.toString();
                }
            });

            pythonProcess.on('close', (code) => {
                console.log(`Python OCR进程退出，状态码: ${code}`);
                if (code !== 0) {
                    console.error(`Python script exited with code ${code}. Error: ${errorData.trim()}`);
                    resolve('');
                } else {
                    try {
                        console.log(`OCR原始输出: ${outputData.trim()}`);
                        const parsedText = JSON.parse(outputData.trim());
                        if (parsedText.debug) {
                            console.log(`OCR调试信息: ${parsedText.debug}`);
                        }
                        const extractedText = parsedText.text || '';
                        console.log(`OCR识别结果: ${extractedText ? '成功' : '无文本'}`);
                        resolve(extractedText);
                    } catch (parseError) {
                        console.error(`Failed to parse JSON from Python script: ${parseError}`);
                        console.error(`Raw output data: ${outputData}`);
                        resolve('');
                    }
                }
            });

            pythonProcess.on('error', (err) => {
                console.error('Failed to start subprocess.', err);
                reject(err);
            });
        });
    }
}

module.exports = OCRProcessor;