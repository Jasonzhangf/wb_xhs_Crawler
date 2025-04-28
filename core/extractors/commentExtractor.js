const cheerio = require('cheerio');

class CommentExtractor {
    static extractComments(html) {
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
}

module.exports = CommentExtractor;
