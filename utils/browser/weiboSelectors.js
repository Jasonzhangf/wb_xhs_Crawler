// 微博页面选择器配置
const weiboSelectors = {
    // 搜索页面选择器
    search: {
        text: '.card-feed .content p[node-type="feed_list_content"]',  // 搜索结果卡片中的内容
        image: '.media.media-piclist img',  // 搜索结果中的图片
        link: '.from a',  // 搜索结果中的链接
        timestamp: '.from a[node-type="feed_list_item_date"]',  // 时间戳
        user: '.info .name',  // 用户名
        repost: '.card-act .toolbar_num_JXZul',  // 转发数
        comment: '.card-act .toolbar_num_JXZul',  // 评论数
        like: '.card-act .woo-like-count'  // 点赞数
    },
    
    // 用户页面选择器
    url: {
        text: '.detail_wbtext_4CRf9',  // 用户页面的微博文本
        image: '.Feed_body_3R0rO img',  // 用户页面的图片
        link: '.head-info_time_6sFQg',  // 用户页面的链接
        timestamp: '.head-info_time_6sFQg',  // 时间戳
        user: '.head_name_24eEB',  // 用户名
        repost: '.toolbar_num_JXZul',  // 转发数
        comment: '.toolbar_num_JXZul',  // 评论数
        like: '.woo-like-count'  // 点赞数
    },
    
    // 历史记录配置
    history: {
        searchHistoryFile: 'search_history.json',  // 搜索历史记录文件
        urlHistoryFile: 'url_history.json',  // URL历史记录文件
        folderHistoryFile: 'folder_history.json'  // 文件夹历史记录文件
    }
};

module.exports = weiboSelectors;