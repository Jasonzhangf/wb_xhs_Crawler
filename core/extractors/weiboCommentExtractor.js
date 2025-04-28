const cheerio = require('cheerio');

class WeiboCommentExtractor {
    static extractComments(html) {
        const $ = cheerio.load(html);
        const comments = [];

        // Find comment container elements
        $('.WB_text').each((i, el) => {
            const $el = $(el);
            // Skip if this is the main post text
            if ($el.closest('.WB_feed_detail').length > 0) {
                return;
            }
            
            // Extract comment text
            const commentText = $el.text().trim();
            
            // Filter out UI elements and empty comments
            if (commentText && 
                !commentText.includes('举报') && 
                !commentText.match(/^\d{2}-\d{2}$/) && // Date format
                !['赞', '回复', '转发'].includes(commentText)) {
                comments.push(commentText);
            }
        });

        return comments;
    }
}

module.exports = WeiboCommentExtractor;
