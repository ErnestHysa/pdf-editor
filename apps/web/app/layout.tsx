import type { Metadata } from 'next';
import './globals.css';
// Must be first — configures pdf.js worker before any pdfjs-dist imports elsewhere
import '@/lib/pdfWorkerConfig';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const metadata: Metadata = {
  title: 'Pagecraft — PDF Editor',
  description: 'A precision web-based PDF editor. Edit text, images, annotations, and more.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
