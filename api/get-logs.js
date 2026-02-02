const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; 
    const REPO = 'office-map';
    
    // 自动计算当前月份文件名
    const currentMonth = new Date().toISOString().slice(0, 7); 
    const LOG_PATH = `logs/${currentMonth}.json`;

    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER, repo: REPO, path: LOG_PATH, ref: 'main'
        });
        
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.status(200).json({ status: 'success', data: JSON.parse(decoded) });
    } catch (error) {
        // 如果这个月还没人搜过，返回空数组
        return res.status(200).json({ status: 'success', data: [] });
    }
}
