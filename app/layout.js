import "./globals.css";

export const metadata = {
  title: "App Compiler — Natural Language to App Schema",
  description: "Convert plain English descriptions into complete, executable app schemas using a multi-stage AI pipeline.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
