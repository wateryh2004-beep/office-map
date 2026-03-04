import OSS from 'ali-oss';

export default async function handler(req, res) {
    const action = req.query.action || (req.body && req.body.action);

    if (!action) {
        return res.status(400).json({ status: 'error', message: '缺少 action 参数' });
    }

    try {
        const client = new OSS({
            region: process.env.ALIYUN_OSS_REGION,
            accessKeyId: process.env.ALIYUN_OSS_AK,
            accessKeySecret: process.env.ALIYUN_OSS_SK,
            bucket: process.env.ALIYUN_OSS_BUCKET,
            secure: true // ★强制开启 HTTPS，彻底解决浏览器下载拦截问题
        });

        // 1. 签发直传通行证
        if (action === 'get-signature') {
            const date = new Date();
            date.setMinutes(date.getMinutes() + 10);
            
            const policy = {
                expiration: date.toISOString(),
                conditions: [ ["content-length-range", 0, 104857600] ]
            };

            const formData = client.calculatePostSignature(policy);
            const host = `https://${process.env.ALIYUN_OSS_BUCKET}.${process.env.ALIYUN_OSS_REGION}.aliyuncs.com`;

            return res.status(200).json({
                status: 'success', host: host, policy: formData.policy,
                OSSAccessKeyId: formData.OSSAccessKeyId, signature: formData.Signature
            });
        }

        // 2. 获取列表 (带强制下载指令)
        else if (action === 'get-list') {
            const result = await client.list({ 'max-keys': 1000 });
            const files = result.objects || [];

            const data = files.map(file => {
                const fileNameOnly = file.name.split('/').pop(); // 提取纯文件名
                
                // ★ 生成带有时效性的 HTTPS 链接，并强制浏览器弹出下载
                const url = client.signatureUrl(file.name, { 
                    expires: 600,
                    response: {
                        'content-disposition': `attachment; filename="${encodeURIComponent(fileNameOnly)}"`
                    }
                }); 
                
                return {
                    name: file.name,
                    size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                    lastModified: file.lastModified,
                    downloadUrl: url
                };
            });

            data.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            return res.status(200).json({ status: 'success', data: data });
        }

        // 3. 删除指定文件
        else if (action === 'delete') {
            const fileName = req.query.file || (req.body && req.body.file);
            await client.delete(fileName);
            return res.status(200).json({ status: 'success', message: '删除成功' });
        }

        // 4. ★★★ 新增：移动文件/重分类 ★★★
        else if (action === 'move') {
            const { oldKey, newKey } = req.body;
            if (!oldKey || !newKey) throw new Error("缺少路径参数");
            
            // 阿里云的移动逻辑：先复制一份到新路径，再删掉旧的
            await client.copy(newKey, oldKey);
            await client.delete(oldKey);
            
            return res.status(200).json({ status: 'success', message: '移动成功' });
        }

        else {
            return res.status(400).json({ status: 'error', message: '未知的 action' });
        }

    } catch (e) {
        console.error("OSS API Error:", e);
        return res.status(500).json({ status: 'error', message: e.message });
    }
}
