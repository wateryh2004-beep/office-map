import * as XLSX from 'xlsx';
import { Octokit } from "@octokit/rest";

// 辅助提取器，忽略表头的空格和换行
const getExcelValue = (row, possibleKeys) => {
    const rowKeys = Object.keys(row);
    for (let pk of possibleKeys) {
        const exactMatch = rowKeys.find(rk => rk.trim() === pk);
        if (exactMatch && row[exactMatch] !== undefined) {
            return String(row[exactMatch]).trim();
        }
    }
    return '';
};

// 从 GitHub 读取 Excel 文件的通用函数
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
        // 1. 获取前端传来的用户邮箱
        const loginEmail = req.query.user;
        if (!loginEmail) return res.status(400).json({ status: 'fail', message: '未指定用户' });

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // 2. 翻译身份：去 users.xlsx 里找这个邮箱，提取英文名
        const usersData = await fetchExcelFromGithub(octokit, 'users.xlsx');
        const matchedUser = usersData.find(u => {
            const email = getExcelValue(u, ['邮箱（即姓名）', '邮箱', 'name', '姓名']);
            return email.toLowerCase() === String(loginEmail).trim().toLowerCase();
        });

        if (!matchedUser) {
            return res.status(200).json({ status: 'fail', message: '在 users.xlsx 中找不到此账号' });
        }

        // 提取 Full Name
        const englishName = getExcelValue(matchedUser, [
            'Full Name', 
            'Full Name (First/Middle/Last)', 
            'Full Name\n(First/Middle/Last)'
        ]);

        if (!englishName) {
            return res.status(200).json({ status: 'fail', message: '该账号未配置英文名，无法匹配分配表' });
        }

        // 3. 查分配表：去 assignments.xlsx 里找这个英文名
        const assignData = await fetchExcelFromGithub(octokit, 'assignments.xlsx');
        const myAssignedBuildings = assignData
            .filter(item => {
                const ownerName = getExcelValue(item, ['负责人名称', '负责人']);
                // 统一转小写对比，防止大小写填错
                return ownerName.toLowerCase() === englishName.toLowerCase();
            })
            .map(item => getExcelValue(item, ['写字楼名称', '名称']).toUpperCase())
            .filter(name => name !== '');

        if (myAssignedBuildings.length === 0) {
            return res.status(200).json({ status: 'success', data: [], message: `未给 [${englishName}] 分配楼宇` });
        }

        // 4. 查底表：去 data.xlsx 捞数据
        const allData = await fetchExcelFromGithub(octokit, 'data.xlsx');
        const myData = allData.filter(item => {
            const buildingName = getExcelValue(item, ['写字楼名称', '名称']).toUpperCase();
            return myAssignedBuildings.includes(buildingName);
        });

        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
