import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
export const metadata: Metadata = { title: "Intake — Client workspace", description: "Turn incoming requests into clear briefs, tasks and a reliable client pipeline.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={inter.variable}><body>{children}</body></html>; }
