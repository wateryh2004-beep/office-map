const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    try {
        const { data } = await octokit.repos.getContent({
            owner: 'wateryh2004-beep', // 确保是你的用户名
            repo: 'office-map',
            path: 'notice.json', // 把公告存为一个极简的json文件
            ref: 'main'
        });
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.status(200).json(JSON.parse(decoded));
    } catch (e) {
        // 如果文件还没创建，返回默认语
        return res.status(200).json({ text: "欢迎使用高力国际办公楼市场监测系统 v7.0！各模块已就绪。" }); 
    }
}
