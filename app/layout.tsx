import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TyreExtractor AI — Tire Pressure Data Extraction',
  description: 'AI-powered heavy equipment tire pressure inspection data extraction from PDFs, images and Excel files.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
