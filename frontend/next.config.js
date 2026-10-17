/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained .next/standalone/server.js that only needs
  // plain `node` to run — no frontend/node_modules required at runtime.
  // This is what lets the launcher ship a working frontend without Bob
  // ever running `npm install`.
  output: 'standalone',
};
module.exports = nextConfig;
