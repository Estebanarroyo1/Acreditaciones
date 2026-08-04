import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { PermissionsProvider } from '@/lib/permissions'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Plataforma de Acreditaciones',
  description: 'Sistema ERP de acreditación corporativa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} antialiased h-full`}>
        <PermissionsProvider>
          {children}
        </PermissionsProvider>
      </body>
    </html>
  )
}
