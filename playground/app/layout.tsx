import { NextDevTools } from 'next-devtools-widget';
import './globals.css';

export const metadata = { title: 'next-devtools playground' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <NextDevTools />
      </body>
    </html>
  );
}
