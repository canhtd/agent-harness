"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.75 6a.75.75 0 0 0-.75.75v2a.75.75 0 0 0 1.5 0v-2A.75.75 0 0 0 4.75 6M7 4.75a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0zm4.25.25a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-.75-.75" />
        <path fillRule="evenodd" clipRule="evenodd" d="M1 4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3zm3-1.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5" />
      </svg>
    ),
  },
  {
    href: "/tokens",
    label: "Tokens",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M4.004 4.499a.75.75 0 0 1 .746-.688l.102.007A.75.75 0 0 1 5.5 4.57v.68h1.004V4.5a.75.75 0 0 1 .648-.743L7.254 3.75a.75.75 0 0 1 .75.75v.75h.502a2.25 2.25 0 0 1 .183 4.493l-.183.007h-.502v1.5H9.5a.75.75 0 0 1 .743.648l.007.102a.75.75 0 0 1-.75.75H8.004v.75a.75.75 0 0 1-.648.743l-.102.007a.75.75 0 0 1-.75-.75v-.75H5.5a.75.75 0 0 1-.743-.648L4.75 11.75a.75.75 0 0 1 .75-.75h1.004v-1.5h-.498a2.25 2.25 0 0 1-.183-4.493l.183-.007h.498V4.5zM6.006 6.5h-.498a.75.75 0 0 0-.102 1.493l.102.007h.498zm1.998 3h.502a.75.75 0 0 0 .102-1.493L8.506 8h-.502z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M1 4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3zm3-1.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5" />
      </svg>
    ),
  },
  {
    href: "/issues",
    label: "Issues",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M8.154 1.004A3 3 0 0 1 11 4v4l-.004.154A3 3 0 0 1 8 11H4l-.154-.004A3 3 0 0 1 1 8V4a3 3 0 0 1 3-3h4zM4 2.5A1.5 1.5 0 0 0 2.5 4v4A1.5 1.5 0 0 0 4 9.5h4A1.5 1.5 0 0 0 9.5 8V4A1.5 1.5 0 0 0 8 2.5z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M13.25 5.25A1.75 1.75 0 0 1 15 7v4.75A3.25 3.25 0 0 1 11.75 15h-5A1.75 1.75 0 0 1 5 13.25a.75.75 0 0 1 1.5 0 .25.25 0 0 0 .25.25h5A1.75 1.75 0 0 0 13.5 11.75V7a.25.25 0 0 0-.25-.25.75.75 0 0 1 0-1.5" />
      </svg>
    ),
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.5 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m0 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2" />
        <path d="M3.5 4.5a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0v-9a.75.75 0 0 1 .75-.75" />
        <path d="M10 2.75A2.75 2.75 0 0 1 13.25 6v4.75a.75.75 0 0 1-1.5 0V6A1.25 1.25 0 0 0 10 4.25H8a.75.75 0 0 1 0-1.5z" />
        <path d="M3.5 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5m0 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2" />
      </svg>
    ),
  },
  {
    href: "/projects",
    label: "Projects",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M7.331 1.07a3.2 3.2 0 0 1 1.338 0c.498.106.967.377 1.904.917l1.354.78c.937.541 1.406.812 1.747 1.19.301.334.53.728.669 1.156.157.484.157 1.025.157 2.107v1.56l-.003.718c-.007.63-.036 1.026-.154 1.389a3.2 3.2 0 0 1-.669 1.156l-.135.138c-.33.312-.792.578-1.612 1.051l-1.354.78-.623.357c-.55.309-.907.481-1.281.56a3.2 3.2 0 0 1-1.338 0c-.374-.08-.73-.252-1.281-.561l-.623-.356-1.354-.78c-.82-.474-1.281-.74-1.612-1.052a3.2 3.2 0 0 1-.804-1.156c-.118-.363-.147-.758-.154-1.39L1.5 8.78V7.22c0-.946 0-1.479.105-1.921a3.2 3.2 0 0 1 .67-1.214c.255-.284.583-.507 1.126-.83l.62-.36 1.354-.78c.82-.473 1.281-.739 1.718-.869zM3 7.22v1.56c0 1.183.018 1.439.084 1.643a1.7 1.7 0 0 0 .356.617c.151.143.427.318 1.323.835l1.354.78.632.36c.188.104.33.178.442.233V8.482L3 6.552zm5.75 1.262v4.826c.212-.106.533-.282 1.074-.594l1.354-.78c.896-.518 1.173-.693 1.323-.835a1.7 1.7 0 0 0 .356-.617c.066-.204.084-.46.084-1.643V7.28c0-.94-.008-1.256-.064-1.43a1.7 1.7 0 0 0-.352-.608c-.135-.15-.386-.295-1.348-.851L9.823 3.61c-.55-.318-.852-.48-1.073-.527V8.482zM7.25 3.083c-.221.048-.523.209-1.073.527l-1.354.78c-.962.556-1.213.702-1.348.851a1.7 1.7 0 0 0-.352.608C3.058 6.025 3.05 6.34 3.05 7.28L7.25 9.19V3.083z" />
      </svg>
    ),
  },
  {
    href: "/teams",
    label: "Teams",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.5 13.5V15h-9v-1.5zm1-1v-9a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1V15l-.256-.013a2.5 2.5 0 0 1-2.231-2.231L1 12.5v-9a2.5 2.5 0 0 1 2.244-2.487L3.5 1h9l.256.013A2.5 2.5 0 0 1 15 3.5v9l-.013.256a2.5 2.5 0 0 1-2.231 2.231L12.5 15v-1.5a1 1 0 0 0 1-1" />
        <path d="M10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0m1.405 6h-6.81c-.407 0-.714-.336-.55-.693.362-.79 1.344-1.974 3.98-1.974 2.648 0 3.597 1.196 3.935 1.986.152.355-.153.681-.555.681" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Agent Harness</div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <ThemeToggle />
      </div>
    </aside>
  );
}
