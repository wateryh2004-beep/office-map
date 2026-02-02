const XLSX = require('xlsx');
const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { user, data } = req.body;
    
    // 检查是否配置了 GitHub Token
    if (!process.env.GITHUB_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Vercel 环境变量 GITHUB_TOKEN 未配置' });
    }

    try {
        // 1. 生成 Excel 文件 (在内存中)
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // 2. 准备上传
        // 文件名：updates/姓名-日期-时间戳.xlsx
        const dateStr = new Date().toISOString().split('T')[0]; 
        const timestamp = new Date().getTime(); 
        const filename = `updates/${user}-${dateStr}-${timestamp}.xlsx`; 

        // 3. 初始化 GitHub 客户端
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        // ★★★ 请务必确认这里的用户名和仓库名是正确的 ★★★
        const OWNER = 'wateryh2004-beep'; // 你的 GitHub 用户名
        const REPO = 'beep';              // 你的仓库名
        const BRANCH = 'main';            // 分支名

        // 4. 上传文件
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filename,
            message: `feat: ${user} uploaded quarterly data`,
            content: excelBuffer.toString('base64'),
            branch: BRANCH,
            committer: {
                name: "Vercel Bot",
                email: "bot@vercel.app"
            }
        });

        return res.status(200).json({ status: 'success', filename: filename });

    } catch (error) {
        console.error("GitHub Upload Error:", error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
}
