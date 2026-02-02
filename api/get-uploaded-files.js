const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; // ★★★ 改成你的用户名 ★★★
    const REPO = 'office-map';        // ★★★ 改成你的仓库名 ★★★
    
    try {
        // 读取 updates 文件夹的内容
        const { data } = await octokit.repos.getContent({
            owner: OWNER, repo: REPO, path: 'updates', ref: 'main'
        });
        
        // 过滤出 .xlsx 文件，并整理格式
        const files = data
            .filter(item => item.name.endsWith('.xlsx'))
            .map(item => ({
                name: item.name,
                size: (item.size / 1024).toFixed(1) + ' KB',
                download_url: item.download_url, // GitHub 提供的直接下载链接
                // 这种API返回没有具体的上传时间，只有sha，但我们可以从文件名里解析日期（你之前定的命名规则）
                date: item.name.split('-')[1] || '未知日期' 
            }));

        return res.status(200).json({ status: 'success', data: files });
    } catch (error) {
        console.error(error);
        return res.status(200).json({ status: 'success', data: [] }); // 文件夹不存在或为空
    }
}
