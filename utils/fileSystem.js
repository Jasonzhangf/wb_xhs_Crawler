const fs = require('fs');
const path = require('path');
const { DATA_DIR, SEARCHED_PATH } = require('../config/constants') || {};

class FileSystemManager {
    constructor() {
        this.visitedUrls = new Set();
        this.searchedResults = [];
        this.maxNoteIndex = 0;
        this.ensureDataDirectory();
        this.loadSearchedResults();
    }

    ensureDataDirectory() {
        if (!DATA_DIR) {
            throw new Error('DATA_DIR is not defined in config/constants.js');
        }
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    scanDirectoryForMaxIndex() {
        let maxIndex = 0;
        if (fs.existsSync(DATA_DIR)) {
            const items = fs.readdirSync(DATA_DIR);
            items.forEach(item => {
                const match = item.match(/note_(\d+)/);
                if (match) {
                    const index = parseInt(match[1]);
                    maxIndex = Math.max(maxIndex, index);
                }
            });
        }
        return maxIndex;
    }

    loadSearchedResults() {
        if (fs.existsSync(SEARCHED_PATH)) {
            try {
                const searchedData = fs.readFileSync(SEARCHED_PATH, 'utf-8');
                if (searchedData.trim()) {
                    this.searchedResults = JSON.parse(searchedData);
                    const validResults = [];

                    for (const result of this.searchedResults) {
                        if (!result || !result.contentPath) continue;
                        
                        const contentPath = path.isAbsolute(result.contentPath) ? 
                            result.contentPath : 
                            path.join(process.cwd(), result.contentPath);
                        
                        const folderPath = path.dirname(contentPath);
                        const exists = fs.existsSync(folderPath);
                        
                        if (exists) {
                            result.contentPath = path.relative(process.cwd(), contentPath);
                            
                            if (result.url) {
                                this.visitedUrls.add(result.url);
                            }
                            validResults.push(result);
                            
                            const match = folderPath.match(/note_(\d+)/);
                            if (match) {
                                const noteIndex = parseInt(match[1]);
                                if (!isNaN(noteIndex)) {
                                    this.maxNoteIndex = Math.max(this.maxNoteIndex, noteIndex);
                                }
                            }
                        }
                    }
                    
                    this.searchedResults = validResults;
                    this.saveSearchedResults();
                }
            } catch (error) {
                console.error('加载搜索记录失败:', error);
                this.searchedResults = [];
                this.visitedUrls.clear();
            }
        }
    }

    saveSearchedResults() {
        fs.writeFileSync(SEARCHED_PATH, JSON.stringify(this.searchedResults, null, 2));
    }

    createNoteDirectory(noteIndex) {
        const notePath = path.join(DATA_DIR, `note_${noteIndex}`);
        if (!fs.existsSync(notePath)) {
            fs.mkdirSync(notePath, { recursive: true });
        }
        return notePath;
    }

    saveNoteContent(notePath, content) {
        const contentPath = path.join(notePath, 'content.json');
        fs.writeFileSync(contentPath, JSON.stringify(content, null, 2));
        return contentPath;
    }

    isUrlVisited(url) {
        return this.visitedUrls.has(url);
    }

    addVisitedUrl(url) {
        this.visitedUrls.add(url);
    }

    addSearchResult(result) {
        this.searchedResults.push(result);
        this.saveSearchedResults();
    }

    getNextNoteIndex() {
        return ++this.maxNoteIndex;
    }

    mergeAllNotes() {
        const mergedData = [];
        
        // 遍历所有笔记目录
        if (fs.existsSync(DATA_DIR)) {
            const noteDirs = fs.readdirSync(DATA_DIR).filter(dir => dir.startsWith('note_'));
            
            for (const dir of noteDirs) {
                const contentPath = path.join(DATA_DIR, dir, 'content.json');
                if (fs.existsSync(contentPath)) {
                    try {
                        const content = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
                        mergedData.push(content);
                    } catch (error) {
                        console.error(`读取笔记内容失败: ${contentPath}`, error);
                    }
                }
            }
        }
        
        return mergedData;
    }
}

module.exports = new FileSystemManager();