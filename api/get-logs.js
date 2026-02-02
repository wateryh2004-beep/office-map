const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; // ★★★ 改成你的用户名 ★★★
    const REPO = 'office-map';        // ★★★ 改成你的仓库名 ★★★
    
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER, repo: REPO, path: 'logs/history.json', ref: 'main'
        });
        
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.status(200).json({ status: 'success', data: JSON.parse(decoded) });
    } catch (error) {
        return res.status(200).json({ status: 'success', data: [] }); // 出错就返回空
    }
}
