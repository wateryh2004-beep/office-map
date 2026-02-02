const XLSX = require('xlsx');
const { Octokit } = require("@octokit/rest");

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { user, data } = req.body;
    
    // 检查 GitHub Token 是否配置
    if (!process.env.GITHUB_TOKEN) {
        return res.status(500).json({ status: 'error', message: 'Vercel 环境变量 GITHUB_TOKEN 未配置' });
    }

    try {
        // 1. 生成 Excel 文件 (在内存中)
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
        // 生成二进制 buffer
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // 2. 准备上传参数
        // 文件名格式：updates/姓名-日期.xlsx
        const dateStr = new Date().toISOString().split('T')[0]; // 2026-02-02
        // 加个时间戳防止同一天覆盖：姓名-日期-时间戳.xlsx
        const timestamp = new Date().getTime(); 
        const filename = `updates/${user}-${dateStr}-${timestamp}.xlsx`; 

        // 3. 初始化 GitHub 客户端
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        // ⚠️ 请修改下面的配置为你自己的 GitHub 信息
        const OWNER = 'wateryh2004-beep'; // 你的 GitHub 用户名
        const REPO = 'beep';              // 你的仓库名
        const BRANCH = 'main';            // 分支名 (main 或 master)

        // 4. 上传文件
        await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: filename,
            message: `feat: ${user} uploaded quarterly data`, // Commit 备注
            content: excelBuffer.toString('base64'), // 必须转为 base64 格式
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
