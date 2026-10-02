import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toast';
import { QueryProvider } from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: {
    default: 'SunTax – Swiss Tax Return Platform',
    template: '%s | SunTax',
  },
  description:
    'SunTax – Your intelligent Swiss tax return platform. AI-powered document processing and accurate tax calculations for all cantons.',
  keywords: [
    'tax return',
    'Switzerland',
    'Swiss tax',
    'Swiss tax return',
    'SunTax',
    'AI tax',
    'canton tax',
  ],
  authors: [{ name: 'SunTax GmbH' }],
  creator: 'SunTax GmbH',
  openGraph: {
    type: 'website',
    locale: 'en_CH',
    url: 'https://suntax.ch',
    siteName: 'SunTax',
    title: 'SunTax – Swiss Tax Return Platform',
    description: 'AI-powered Swiss tax return platform for all 26 cantons',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SunTax – Swiss Tax Return Platform',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
