export default function handler(req, res) {
    // 为了安全，只有知道这个接口的人才能请求（虽然对于内部系统，这样够用了）
    // 真正的安全依赖于你 index.html 里的 Admin 登录拦截
    
    const token = process.env.GITHUB_TOKEN;
    
    if (!token) {
        return res.status(500).json({ error: 'Token not configured' });
    }

    // 将 Token 发送给前端
    return res.status(200).json({ token: token });
}
