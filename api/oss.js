const OSS = require('ali-oss');
const crypto = require('crypto');

export default async function handler(req, res) {
    const action = req.query.action;

    try {
        if (!process.env.OSS_AK || !process.env.OSS_SK) {
            return res.status(500).json({ status: 'error', message: '环境变量 OSS_AK 或 OSS_SK 丢失' });
        }

        const region = process.env.ALIYUN_OSS_REGION || process.env.OSS_REGION || 'oss-cn-shanghai';
        const bucket = process.env.ALIYUN_OSS_BUCKET || process.env.OSS_BUCKET || 'colliers-reports';

        const client = new OSS({
            region: region,
            accessKeyId: process.env.OSS_AK,
            accessKeySecret: process.env.OSS_SK,
            bucket: bucket,
            timeout: 7000,
            secure: true 
        });

        // 1. 获取直传签名
        if (action === 'get-signature') {
            const date = new Date();
            date.setHours(date.getHours() + 1); 
            const policy = {
                expiration: date.toISOString(),
                conditions: [
                    ["content-length-range", 0, 104857600], 
                    ["starts-with", "$key", ""] 
                ]
            };

            const base64Policy = Buffer.from(JSON.stringify(policy)).toString('base64');
            const signature = crypto.createHmac('sha1', process.env.OSS_SK).update(base64Policy).digest('base64');

            return res.status(200).json({
                status: 'success',
                accessid: process.env.OSS_AK,
                host: `https://${client.options.bucket}.${client.options.region}.aliyuncs.com`,
                policy: base64Policy,
                signature: signature,
                expire: Math.floor(date.getTime() / 1000)
            });
        }

        // 2. 获取目录列表
        else if (action === 'get-list') {
            const prefix = req.query.prefix || ''; 
            
            const result = await client.list({
                prefix: prefix,
                delimiter: '/',
                'max-keys': 1000
            });

            const folders = (result.prefixes || []).map(p => ({
                name: p,
                type: 'folder'
            }));

            // ★ 核心优化：彻底过滤掉 OSS 自动生成的纯目录对象和隐藏文件
            const files = (result.objects || [])
                .filter(o => o.name !== prefix && !o.name.endsWith('/') && !o.name.endsWith('.keep')) 
                .map(o => {
                    const url = client.signatureUrl(o.name, { expires: 3600 });
                    return {
                        name: o.name,
                        shortName: o.name.replace(prefix, ''), 
                        size: (o.size / 1024 / 1024).toFixed(2) + ' MB',
                        lastModified: o.lastModified,
                        type: 'file',
                        url: url
                    };
                });

            return res.status(200).json({ 
                status: 'success', 
                currentPath: prefix,
                data: [...folders, ...files] 
            });
        }

        // ★ 3. 新增：后端原生创建真实文件夹
        else if (action === 'create-folder' && req.method === 'POST') {
            let { folder } = req.body;
            if (!folder) return res.status(400).json({ message: "缺少文件夹名称" });
            
            // 阿里云OSS官方规定：以 '/' 结尾且大小为0的对象，即为文件夹
            if (!folder.endsWith('/')) folder += '/';
            
            // 直接向 OSS 写入一个空 Buffer
            await client.put(folder, Buffer.from(''));
            return res.status(200).json({ status: 'success' });
        }

        // 4. 删除文件或文件夹
        else if (action === 'delete') {
            const fileKey = req.query.file;
            if (!fileKey) return res.status(400).json({ message: "Missing file key" });
            
            await client.delete(fileKey);
            return res.status(200).json({ status: 'success' });
        }

        // 5. 移动/重命名
        else if (action === 'move' && req.method === 'POST') {
            const { oldKey, newKey } = req.body;
            if (!oldKey || !newKey) return res.status(400).json({ message: "Keys missing" });

            await client.copy(newKey, oldKey);
            await client.delete(oldKey);
            return res.status(200).json({ status: 'success' });
        }

        return res.status(400).json({ message: "Invalid action" });

    } catch (e) {
        console.error("OSS API Error:", e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
