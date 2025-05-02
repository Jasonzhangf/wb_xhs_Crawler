const path = require('path');
const fs = require('fs');

class SearchHandler {
    constructor(browser, options = {}) {
        this.browser = browser;
        this.searchRetryCount = 0;
        this.maxSearchRetries = options.maxSearchRetries || 3;
    }

    async handleSearch(task, taskDir) {
        this.searchRetryCount = 0;
        while (this.searchRetryCount < this.maxSearchRetries) {
            console.log(`Starting search attempt ${this.searchRetryCount + 1}/${this.maxSearchRetries}...`);
            try {
                await this.browser.core.navigateToSearchPage(task.keyword);
                await this.browser.wait(2000);

                // Save the HTML content of the search page
                const searchPageHtml = await this.browser.page.content();
                fs.writeFileSync(
                    path.join(taskDir, 'search_page.html'),
                    searchPageHtml,
                    'utf8'
                );
                console.log('Search page HTML content saved');

                return true;
            } catch (error) {
                console.error('Search attempt failed:', error);
                this.searchRetryCount++;
                if (this.searchRetryCount >= this.maxSearchRetries) {
                    console.log(`Maximum search retries (${this.maxSearchRetries}) reached, ending task`);
                    return false;
                }
            }
        }
        return false;
    }
}

module.exports = SearchHandler;