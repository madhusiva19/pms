import Sidebar from "./components/Sidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ display: "flex" }}>
        <Sidebar />
        <main style={{ flex: 1, padding: "0px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}