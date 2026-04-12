/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent lightweight-charts from being bundled on the server
      config.externals = [...(config.externals || []), 'lightweight-charts']
    }
    return config
  },
}

export default nextConfig
