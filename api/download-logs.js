const { Octokit } = require("@octokit/rest");
const XLSX = require('xlsx');

export default async function handler(req, res) {
    // 获取前端传来的月份参数，例如 ?month=2026-02
    const { month } = req.query;
    
    if (!month) return res.status(400).send("请提供月份，例如 ?month=2026-02");

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const OWNER = 'wateryh2004-beep'; 
    const REPO = 'office-map';
    const LOG_PATH = `logs/${month}.json`;

    try {
        // 1. 从 GitHub 获取 JSON 数据
        const { data } = await octokit.repos.getContent({
            owner: OWNER, repo: REPO, path: LOG_PATH, ref: 'main'
        });
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        const jsonData = JSON.parse(decoded);

        // 2. 数据清洗：把复杂的 JSON 展平，变成适合 Excel 的行
        const excelData = jsonData.map(item => ({
            "时间": item.time,
            "用户姓名": item.user,
            "行为类型": item.action === 'search' ? '搜索/筛选' : item.action,
            "搜索关键词": item.details.keyword,
            "筛选条件": item.details.filter
        }));

        // 3. 生成 Excel
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "SearchLogs");
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // 4. 发送给浏览器下载
        res.setHeader('Content-Disposition', `attachment; filename="Search_History_${month}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(excelBuffer);

    } catch (error) {
        console.error(error);
        res.status(404).send(`找不到 ${month} 月份的数据记录，或者 GitHub 连接失败。`);
    }
}
