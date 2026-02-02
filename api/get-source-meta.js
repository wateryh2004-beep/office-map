const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    // ★★★ 请确认下面的用户名和仓库名正确 ★★★
    const OWNER = 'wateryh2004-beep'; 
    const REPO = 'office-map';        
    const FILE_PATH = 'data.xlsx';

    try {
        // 获取该文件的最后一次 Commit 信息
        const { data } = await octokit.repos.listCommits({
            owner: OWNER,
            repo: REPO,
            path: FILE_PATH,
            per_page: 1, // 只要最新的一条
        });

        if (data.length > 0) {
            const lastCommit = data[0];
            const date = new Date(lastCommit.commit.committer.date).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
            
            return res.status(200).json({ 
                status: 'success', 
                lastUpdated: date,
                author: lastCommit.commit.committer.name
            });
        } else {
            return res.status(200).json({ status: 'success', lastUpdated: '未知时间' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 'error', lastUpdated: '获取失败' });
    }
}
