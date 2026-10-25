/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimize server packages and prevent lazy loading stalls
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default function config() {
  return nextConfig;
}
