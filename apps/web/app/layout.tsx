import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Marketing OS',
  description: 'Tenant-scoped marketing operating system with governed AI execution.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
