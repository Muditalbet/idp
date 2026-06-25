import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'IDP — Internal Developer Platform',
  description: 'Self-service platform: push code, get namespace, CI/CD, DNS and observability.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
