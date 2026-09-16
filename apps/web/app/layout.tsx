import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NAWA Growth OS',
  description: 'Tenant-scoped Growth Operating System with governed AI recommendations and execution.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
