const fs = require('fs');
const path = require('path');

let brandConfig = {
  brand_name: 'SunTax',
  brand_short_left: 'Sun',
  brand_short_right: 'Tax',
  brand_domain: 'suntax.ch',
  support_email: 'info@suntax.ch',
  noreply_email: 'noreply@suntax.ch',
  logo_path: '/brand-logo.svg',
  primary_color: '#1E7B52',
  company_legal_name: 'SunTax Switzerland AG',
};

try {
  const brandJsonPath = path.resolve(__dirname, '../backend/app/data/brand_config.json');
  if (fs.existsSync(brandJsonPath)) {
    brandConfig = {
      ...brandConfig,
      ...JSON.parse(fs.readFileSync(brandJsonPath, 'utf-8')),
    };
  }
} catch {
  // Use defaults if file cannot be loaded at build time
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Environment variables exposed to client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME || brandConfig.brand_name,
    NEXT_PUBLIC_BRAND_SHORT_LEFT: process.env.NEXT_PUBLIC_BRAND_SHORT_LEFT || brandConfig.brand_short_left,
    NEXT_PUBLIC_BRAND_SHORT_RIGHT: process.env.NEXT_PUBLIC_BRAND_SHORT_RIGHT || brandConfig.brand_short_right,
    NEXT_PUBLIC_BRAND_DOMAIN: process.env.NEXT_PUBLIC_BRAND_DOMAIN || brandConfig.brand_domain,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || brandConfig.support_email,
    NEXT_PUBLIC_NOREPLY_EMAIL: process.env.NEXT_PUBLIC_NOREPLY_EMAIL || brandConfig.noreply_email,
    NEXT_PUBLIC_BRAND_LOGO_PATH: process.env.NEXT_PUBLIC_BRAND_LOGO_PATH || brandConfig.logo_path,
    NEXT_PUBLIC_BRAND_PRIMARY_COLOR: process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR || brandConfig.primary_color,
    NEXT_PUBLIC_COMPANY_LEGAL_NAME: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME || brandConfig.company_legal_name,
  },

  // Image configuration
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/suntax/**',
      },
      {
        protocol: 'https',
        hostname: '*.suntax.ch',
        pathname: '/**',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: http://localhost:9000 https://*.suntax.ch",
              "connect-src 'self' http://localhost:8000 ws://localhost:8000 https://suntax-api.onrender.com wss://suntax-api.onrender.com https://*.suntax.ch wss://*.suntax.ch",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Webpack config for performance
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
