import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: {
    default: "Construction RAG",
    template: "%s – Construction RAG",
  },
  description:
    "Ask questions about your construction documents and get answers that cite the page they came from.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
