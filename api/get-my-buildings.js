const XLSX = require('xlsx');
const path = require('path');

export default function handler(req, res) {
    try {
        const userName = req.query.user;
        if (!userName) return res.status(400).json({ status: 'fail', message: '未指定用户' });

        const filePath = path.join(process.cwd(), 'data.xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const allData = XLSX.utils.sheet_to_json(sheet);

        const myData = allData.filter(item => {
            const itemUser = item['USER'] || item['User'] || item['user']; 
            return itemUser && String(itemUser).trim() === String(userName).trim();
        });

        return res.status(200).json({ status: 'success', data: myData });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ status: 'error', message: '服务器读取 data.xlsx 失败' });
    }
}
