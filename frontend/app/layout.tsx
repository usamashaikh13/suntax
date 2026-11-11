import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toast';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} – Swiss Tax Return Platform`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    `${BRAND.name} – Your intelligent Swiss tax return platform. AI-powered document processing and accurate tax calculations for all cantons.`,
  keywords: [
    'tax return',
    'Switzerland',
    'Swiss tax',
    'Swiss tax return',
    BRAND.name,
    'AI tax',
    'canton tax',
  ],
  authors: [{ name: BRAND.companyLegalName }],
  creator: BRAND.companyLegalName,
  openGraph: {
    type: 'website',
    locale: 'en_CH',
    url: `https://${BRAND.domain}`,
    siteName: BRAND.name,
    title: `${BRAND.name} – Swiss Tax Return Platform`,
    description: 'AI-powered Swiss tax return platform for all 26 cantons',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} – Swiss Tax Return Platform`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

import { LanguageProvider } from '@/lib/i18n/LanguageContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de-CH">
      <body className="min-h-screen bg-background font-sans antialiased">
        <LanguageProvider>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
