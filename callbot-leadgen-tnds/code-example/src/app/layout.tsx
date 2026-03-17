import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./lib/envSetup";

export const metadata: Metadata = {
  title: "Realtime API Agents",
  description: "A demo app from OpenAI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        <Script id="crypto-randomuuid-polyfill" strategy="beforeInteractive">
          {`
(function () {
  try {
    var g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g) return;

    // Ensure crypto + getRandomValues exist (fallback is non-crypto, but prevents crashes)
    if (!g.crypto) g.crypto = {};
    if (typeof g.crypto.getRandomValues !== 'function') {
      g.crypto.getRandomValues = function (arr) {
        for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      };
    }

    if (typeof g.crypto.randomUUID === 'function') return;

    function hex(b) {
      return b.toString(16).padStart(2, '0');
    }

    g.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      g.crypto.getRandomValues(bytes);
      // RFC 4122 v4
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var s = Array.prototype.map.call(bytes, hex).join('');
      return (
        s.slice(0, 8) + '-' +
        s.slice(8, 12) + '-' +
        s.slice(12, 16) + '-' +
        s.slice(16, 20) + '-' +
        s.slice(20)
      );
    };
  } catch (_) {}
})();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
