const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function extractComments(html) {
    const $ = cheerio.load(html);
    const comments = [];

    // Find comment container elements
    $('.commentItem, .comment-item').each((i, el) => {
        // Look for the actual comment text within the container
        const commentTextEl = $(el).find('.commentText, .comment-text, .commentContent').first();
        if (commentTextEl.length > 0) {
            const commentText = commentTextEl.text().trim();
            // Filter out UI elements, metadata, and empty comments
            if (commentText && 
                !commentText.includes('举报评论') && 
                !commentText.match(/^\d{2}-\d{2}$/) && // Date format
                !['赞', '回复', '作者'].includes(commentText)) {
                comments.push(commentText);
            }
        }
    });

    return comments;
}

function testCommentExtraction(htmlFilePath) {
    console.log(`
Testing file: ${htmlFilePath}`);
    try {
        const html = fs.readFileSync(htmlFilePath, 'utf-8');
        const comments = extractComments(html);
        console.log('Found comments:', comments.length);
        comments.forEach((comment, i) => {
            console.log(`Comment ${i + 1}:`, comment.substring(0, 100) + (comment.length > 100 ? '...' : ''));
        });
    } catch (error) {
        console.error(`Error processing ${htmlFilePath}:`, error.message);
    }
}

// Test all page.html files in data/xhs directory
function runTests() {
    const baseDir = path.join(__dirname, '..', 'data', 'xhs');
    function processDirectory(dir) {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                processDirectory(fullPath);
            } else if (item === 'page.html') {
                testCommentExtraction(fullPath);
            }
        });
    }
    processDirectory(baseDir);
}

runTests();
