const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WeiboCommentExtractor = require('../core/extractors/weiboCommentExtractor');

describe('WeiboCommentExtractor', () => {
    const testDataDir = path.join(__dirname, 'data', 'weibo');
    
    before(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
    });

    it('should extract comments from Weibo post HTML', () => {
        // Read sample HTML file
        const sampleHtmlPath = path.join(testDataDir, 'sample_weibo_post.html');
        const html = fs.readFileSync(sampleHtmlPath, 'utf8');
        
        // Extract comments
        const comments = WeiboCommentExtractor.extractComments(html);
        
        // Assertions
        assert(Array.isArray(comments), 'Comments should be an array');
        assert(comments.length > 0, 'Should extract at least one comment');
        
        // Verify comment structure
        comments.forEach(comment => {
            assert(typeof comment === 'string', 'Each comment should be a string');
            assert(comment.trim().length > 0, 'Comments should not be empty');
            assert(!comment.includes('举报'), 'Comments should not include UI elements');
        });
    });
    
    it('should handle posts with no comments', () => {
        const emptyHtml = '<div class="WB_text">暂无评论</div>';
        const comments = WeiboCommentExtractor.extractComments(emptyHtml);
        assert(Array.isArray(comments), 'Should return an array even when no comments');
        assert.strictEqual(comments.length, 0, 'Should return empty array for posts with no comments');
    });
    
    it('should filter out UI elements and metadata', () => {
        const htmlWithUI = `
            <div class="WB_text">
                <a href="#">举报</a>
                <span>04-15</span>
                <em>赞</em>
                <span>This is a real comment</span>
            </div>
        `;
        const comments = WeiboCommentExtractor.extractComments(htmlWithUI);
        assert.strictEqual(comments.length, 1, 'Should only extract actual comment content');
        assert.strictEqual(comments[0], 'This is a real comment', 'Should extract correct comment text');
    });
});
