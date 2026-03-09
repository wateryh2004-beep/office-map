import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 提取器：暴力去空格、换行符、转小写匹配表头
const getExcelValue = (row, possibleKeys) => {
    const rowKeys = Object.keys(row);
    for (let pk of possibleKeys) {
        const normalizedPk = pk.replace(/\s+/g, '').toLowerCase();
        const exactMatch = rowKeys.find(rk => rk.replace(/\s+/g, '').toLowerCase() === normalizedPk);
        if (exactMatch && row[exactMatch] !== undefined) {
            return String(row[exactMatch]).trim();
        }
    }
    return '';
};

async function fetchExcelFromGithub(octokit, path) {
    try {
        const response = await octokit.repos.getContent({ 
            owner: 'wateryh2004-beep', 
            repo: 'office-map', 
            path: path, 
            ref: 'main' 
        });
        const buffer = Buffer.from(response.data.content, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    } catch (e) {
        throw new Error(`无法读取文件 [${path}]，请确保文件存在于 GitHub。`);
    }
}

export default async function handler(req, res) {
    try {
        const loginStr = req.query.user;
        if (!loginStr) return res.status(400).json({ status: 'fail', message: '未指定用户' });

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // ==========================================
        // 步骤 1：确认身份，去 users.xlsx 提取准确的英文名
        // ==========================================
        const usersData = await fetchExcelFromGithub(octokit, 'users.xlsx');
        const matchedUser = usersData.find(u => {
            const email = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'email']);
            const fullName = getExcelValue(u, ['FullName', 'FullName(First/Middle/Last)', '英文名']);
            const searchTarget = String(loginStr).trim().toLowerCase();
            return email.toLowerCase() === searchTarget || fullName.toLowerCase() === searchTarget;
        });

        if (!matchedUser) {
            return res.status(200).json({ status: 'fail', message: `在 users.xlsx 中找不到账号: ${loginStr}` });
        }

        const englishName = getExcelValue(matchedUser, ['FullName', 'FullName(First/Middle/Last)', '英文名', 'name']);
        if (!englishName) {
            return res.status(200).json({ status: 'fail', message: '在 users.xlsx 找到该账号，但未配置有效的 Full Name 列' });
        }

        // ==========================================
        // 步骤 2：直接去底表 data.xlsx 捞数据（抛弃 assignments.xlsx）
        // ==========================================
        const allData = await fetchExcelFromGithub(octokit, 'data.xlsx');
        
        const myData = allData.filter(item => {
            // 抓取底表中的 USER 列（支持命名为 USER, User, 负责人 等）
            const ownerStr = getExcelValue(item, ['USER', 'User', '负责人', '负责人名称']);
            if (!ownerStr) return false;

            // 支持一栋楼分配给多个人（用逗号或中文逗号隔开）
            const owners = ownerStr.toLowerCase().split(/[,，]/).map(n => n.trim());
            
            // 检查当前用户的英文名是否在这一行的名单里
            return owners.includes(englishName.toLowerCase());
        });

        if (myData.length === 0) {
            return res.status(200).json({ 
                status: 'success', 
                data: [], 
                message: `底表 data.xlsx 中没有为 [${englishName}] 分配需要填报的项目（请检查 USER 列）。` 
            });
        }

        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
