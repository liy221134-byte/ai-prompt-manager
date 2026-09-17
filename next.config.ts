import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 项目已经维护自己的 AGENTS.md，禁止开发服务器自动追加框架说明。
  agentRules: false,
  // 关闭开发环境的悬浮调试标识，避免遮挡页面内容。
  devIndicators: false,
};

export default nextConfig;
