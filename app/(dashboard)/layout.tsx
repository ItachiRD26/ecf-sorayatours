"use client";

import { useState } from "react";
import { AuthProvider }        from "@/contexts/AuthContext";
import Sidebar, { SidebarCtx } from "@/components/layout/sidebar";
import Topbar                   from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AuthProvider>
      <SidebarCtx.Provider value={{ open, setOpen }}>
        <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
          <Sidebar />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <Topbar />
            <main style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {children}
            </main>
          </div>
        </div>
      </SidebarCtx.Provider>
    </AuthProvider>
  );
}