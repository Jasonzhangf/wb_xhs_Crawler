const path = require('path');
const { spawn } = require('child_process');

class OCRProcessor {
    static async extractTextFromImage(imagePath, noimage = false) {
        // noimage参数仅用于控制是否执行OCR，不影响图片的获取和保存
        return new Promise((resolve, reject) => {
            if (noimage) {
                console.log('OCR处理已跳过（noimage=true）');
                resolve('');
                return;
            }
            const absolutePath = path.resolve(imagePath);
            console.log('开始OCR1处理，图片路径:', absolutePath);

            const pythonScript = `
import easyocr
import sys
import os
import io
import traceback
import json

# 设置标准输出为UTF-8编码
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "未提供图片路径参数"}), file=sys.stderr)
        sys.exit(1)
    
    image_path_arg = sys.argv[1]

    if not os.path.exists(image_path_arg):
        print(json.dumps({"error": f"图片文件不存在: {image_path_arg}"}), file=sys.stderr)
        sys.exit(1)
    
    try:
        reader = easyocr.Reader(['ch_sim','en'], gpu=False)
        result = reader.readtext(image_path_arg)
    except Exception as e:
        error_message = f"读取或处理图片失败: {str(e)}"
        print(json.dumps({"error": error_message}), file=sys.stderr)
        sys.exit(1)
        
    if not result:
        print(json.dumps(""))
        sys.exit(0)
    
    text_parts = [item[1] for item in result if item and len(item) > 1]
    if text_parts:
        text = "\\n".join(text_parts)
        print(json.dumps({"text": text}))
        sys.exit(0)
    else:
        print(json.dumps({"text": ""}))
        sys.exit(0)
except Exception as e:
    error_message = f"未预期的错误: {str(e)}"
    print(json.dumps({"error": error_message}), file=sys.stderr)
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
                if (code !== 0) {
                    console.error(`Python script exited with code ${code}. Error: ${errorData.trim()}`);
                    resolve('');
                } else {
                    try {
                        const parsedText = JSON.parse(outputData.trim());
                        resolve(parsedText.text || '');
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