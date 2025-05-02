const path = require('path');
const fs = require('fs');

class FileManager {
    constructor() {}

    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    createNoteDirectory(taskDir, noteIndex) {
        const noteDir = path.join(taskDir, `note_${noteIndex}`);
        this.ensureDir(noteDir);
        return noteDir;
    }

    async mergeJsonFiles(taskDir, keyword, exportPath) {
        try {
            const allContent = [];
            const files = fs.readdirSync(taskDir);
            
            for (const dir of files) {
                const dirPath = path.join(taskDir, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    const contentPath = path.join(dirPath, 'content.json');
                    if (fs.existsSync(contentPath)) {
                        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                        allContent.push(content);
                    }
                }
            }
            
            if (allContent.length > 0) {
                const txtContent = allContent.map(note => {
                    let content = `Title: ${note.title || 'No Title'}\n`;
                    content += `Content: ${note.text || 'No Content'}\n`;
                    if (note.comments && note.comments.length > 0) {
                        content += 'Comments:\n' + note.comments.map(c => `- ${c}`).join('\n') + '\n';
                    }
                    if (note.ocr_texts && note.ocr_texts.length > 0) {
                        content += 'OCR Text:\n' + note.ocr_texts.map(t => `- Image${t.image_index}: ${t.text}`).join('\n') + '\n';
                    }
                    content += `URL: ${note.url || 'No URL'}\n`;
                    content += '---\n';
                    return content;
                }).join('\n');
                
                const txtFileName = `${keyword}_${allContent.length}items.txt`;
                const txtPath = path.join(taskDir, txtFileName);
                fs.writeFileSync(txtPath, txtContent, 'utf-8');
                
                const mdContent = allContent.map(note => {
                    let content = `# ${note.title || 'No Title'}\n\n`;
                    content += `${note.text || 'No Content'}\n\n`;
                    if (note.comments && note.comments.length > 0) {
                        content += '## Comments\n\n' + note.comments.map(c => `* ${c}`).join('\n') + '\n\n';
                    }
                    if (note.ocr_texts && note.ocr_texts.length > 0) {
                        content += '## OCR Text\n\n' + note.ocr_texts.map(t => `* Image${t.image_index}: ${t.text}`).join('\n') + '\n\n';
                    }
                    content += `[Original Link](${note.url || '#'})\n\n---\n\n`;
                    return content;
                }).join('');
                
                const mdFileName = `${keyword}_${allContent.length}items.md`;
                const mdPath = path.join(taskDir, mdFileName);
                fs.writeFileSync(mdPath, mdContent, 'utf-8');
                
                if (exportPath) {
                    const exportDir = typeof exportPath === 'string' ? exportPath : path.join(process.cwd(), 'export');
                    if (!fs.existsSync(exportDir)) {
                        fs.mkdirSync(exportDir, { recursive: true });
                    }
                    fs.copyFileSync(mdPath, path.join(exportDir, mdFileName));
                    fs.copyFileSync(txtPath, path.join(exportDir, txtFileName));
                }
                
                console.log(`Merged ${allContent.length} notes to:\n- ${txtPath}\n- ${mdPath}`);
                return allContent.length;
            }
            console.log('No notes found to merge');
            return 0;
        } catch (error) {
            console.error(`File merge failed: ${error.message}`);
            return 0;
        }
    }

    savePageContent(filePath, content) {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error) {
            console.error(`Failed to save page content: ${error.message}`);
            return false;
        }
    }

    saveJsonContent(filePath, content) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`Failed to save JSON content: ${error.message}`);
            return false;
        }
    }
}

module.exports = FileManager;