import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Customer Acquisition Platform',
  description: 'Commercial workflow control plane',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
