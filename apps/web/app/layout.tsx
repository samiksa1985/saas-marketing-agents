import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CODECORE AI — Growth Intelligence OS',
  description: 'AI-Native Marketing, Revenue & Growth Operating System',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
