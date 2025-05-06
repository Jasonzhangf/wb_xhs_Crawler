const fs = require('fs');
const path = require('path');

class Randomizer {
    static getUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
        ];
        return agents[Math.floor(Math.random() * agents.length)];
    }

    static getRandomHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
        };
    }

    static getWaitTime(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static getScrollParameters() {
        return {
            distance: Math.floor(Math.random() * 200) + 100,
            duration: Math.random() * 1000 + 500
        };
    }

    static generateMouseTrack() {
        return Array.from({length: 10}, () => ({
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            duration: Math.random() * 1000 + 500
        }));
    }
}

module.exports = Randomizer;