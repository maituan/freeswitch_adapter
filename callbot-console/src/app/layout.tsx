import React from 'react'
import './globals.css'

export const metadata = {
  title: 'CallBot Console',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-slate-950 text-slate-50">
        <div className="min-h-screen flex flex-col">
          <header className="app-shell-header border-b border-slate-800 px-6 py-3 flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <h1 className="text-sm font-semibold">CallBot Console</h1>
              <div className="text-xs text-slate-400">Gọi thử, chiến dịch, lịch sử hội thoại</div>
            </div>
            <nav className="ml-6 flex gap-4 text-xs text-slate-400">
              <a href="/single-call" className="chip-nav chip-nav-active">
                Gọi lẻ
              </a>
              <a href="/campaigns" className="chip-nav chip-nav-muted">
                Chiến dịch
              </a>
              <a href="/history" className="chip-nav chip-nav-muted">
                Lịch sử cuộc gọi
              </a>
            </nav>
          </header>
          <main className="flex-1 px-6 py-4 max-w-5xl mx-auto w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}

