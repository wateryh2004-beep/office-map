import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 兼容通过 URL 参数或 Body 传递 action
    const action = req.query.action || (req.body && req.body.action);
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    // 如果未绑定 KV 数据库的降级处理
    if (!hasKV) {
        if (action === 'get-notice') {
            return res.status(200).json({ status: 'success', text: '欢迎使用高力国际办公楼市场数据终端！' });
        }
        if (action === 'get-messages') {
            return res.status(200).json([]);
        }
        return res.status(400).json({ status: 'fail', message: 'Vercel KV 数据库未连接，无法发布和保存动态数据。' });
    }

    try {
        // ==========================================
        // 1. 获取公告 (门户大厅底部滚动使用)
        // ==========================================
        if (action === 'get-notice') {
            const text = await kv.get('portal_notice') || '欢迎使用高力国际办公楼市场数据终端！';
            return res.status(200).json({ status: 'success', text });
        }
        
        // ==========================================
        // 2. 更新公告 (管理员后台发布使用)
        // ==========================================
        else if (action === 'update-notice') {
            const { text } = req.body;
            if (!text) return res.status(400).json({ status: 'fail', message: '公告内容不能为空' });
            
            // 将新公告存入 KV 数据库
            await kv.set('portal_notice', text);
            return res.status(200).json({ status: 'success' });
        }

        // ==========================================
        // 3. 获取留言板 (门户大厅加载使用)
        // ==========================================
        else if (action === 'get-messages') {
            const msgs = await kv.get('portal_messages') || [];
            return res.status(200).json(msgs);
        }

        // ==========================================
        // 4. 发送留言 (门户大厅互动使用)
        // ==========================================
        else if (action === 'post-message') {
            const { user, text } = req.body;
            if (!user || !text) return res.status(400).json({ status: 'fail', message: '留言参数不完整' });

            let msgs = await kv.get('portal_messages') || [];
            
            // 格式化当前北京时间 (处理 Vercel 零时区的问题，+8小时)
            const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
            const timeStr = `${d.getMonth()+1}-${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            
            // 存入新留言
            msgs.push({ user, text, time: timeStr });
            
            // 防爆机制：只保留最近的 50 条留言，防止缓存撑爆
            if (msgs.length > 50) msgs = msgs.slice(msgs.length - 50);
            
            await kv.set('portal_messages', msgs);
            return res.status(200).json({ status: 'success' });
        }

        // 都不匹配时返回
        return res.status(400).json({ status: 'fail', message: 'Invalid Action' });

    } catch (e) {
        console.error("Portal API Error:", e.message);
        return res.status(500).json({ status: 'error', message: '服务器内部读取错误' });
    }
}
