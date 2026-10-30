
"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <Sidebar
        open={menuAberto}
        onClose={() => setMenuAberto(false)}
      />

      <div className="min-h-screen lg:pl-67">
        <Header onMenuClick={() => setMenuAberto(true)} />

        <main className="mx-auto w-full max-w-400 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
