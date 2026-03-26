export const metadata = {
  title: 'OMR VPS - Tecnoadsl',
  description: 'OpenMPTCProuter VPS Dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
