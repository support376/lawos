import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Windows에서 PostCSS 자식 프로세스 크래시 회피 (Jest worker child_process exceptions)
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
