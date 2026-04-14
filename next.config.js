/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'lightweight-charts-line-tools-core': path.resolve(__dirname, 'vendor/lightweight-charts-line-tools-core/dist/lightweight-charts-line-tools-core.js'),
      'lightweight-charts-line-tools-lines': path.resolve(__dirname, 'vendor/lightweight-charts-line-tools-lines/dist/lightweight-charts-line-tools-lines.js'),
      'lightweight-charts-line-tools-long-short-position': path.resolve(__dirname, 'vendor/lightweight-charts-line-tools-long-short-position/dist/lightweight-charts-line-tools-long-short-position.js'),
    }
    return config
  },
}

module.exports = nextConfig
