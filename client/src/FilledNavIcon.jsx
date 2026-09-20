import React from "react";

const GLYPHS = {
  home: <path d="M12 2.6 2.5 10.4l1.3 1.6L5 11v9.4h5.3v-5.8h3.4v5.8H19V11l1.2 1 1.3-1.6L12 2.6Z" />,
  stock: (
    <path d="M3.5 6.4 12 2l8.5 4.4v11.2L12 22l-8.5-4.4V6.4Zm2.2 1.1 6.3 3.3 6.3-3.3L12 4.2 5.7 7.5Zm-.2 1.7v7.2l5.5 2.9v-7.2L5.5 9.2Zm13 0L13 12.1v7.2l5.5-2.9V9.2Z" />
  ),
  sales: (
    <path d="M15 3h4a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4a3 3 0 0 1 6 0Zm-3-1.1a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM7 9v2h2V9H7Zm4 0v2h6V9h-6Zm-4 4v2h2v-2H7Zm4 0v2h6v-2h-6Zm-4 4v2h2v-2H7Zm4 0v2h6v-2h-6Z" />
  ),
  restaurant: (
    <path d="M3 2h2v7h2V2h2v7h2V2h2v7a5 5 0 0 1-4 4.9V22H7v-8.1A5 5 0 0 1 3 9V2Zm14 0c2.2 0 4 1.8 4 4v8h-2v8h-2V2Z" />
  ),
  growth: (
    <path d="M12 21.2 10.6 20C5.4 15.4 2 12.3 2 8.5A4.5 4.5 0 0 1 6.5 4 5 5 0 0 1 12 7.1 5 5 0 0 1 17.5 4 4.5 4.5 0 0 1 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.2Z" />
  ),
  control: (
    <path d="M3 3h7v7H3V3Zm11 0h7v7h-7V3Zm0 11h7v7h-7v-7ZM9 6h6v2H9V6Zm3 1h2v11H9v-2h3V7Z" />
  ),
  ecosystem: (
    <path d="M9 2h2v4h2V2h2v4h2v3a5 5 0 0 1-4 4.9V17h4v5H7v-5h4v-3.1A5 5 0 0 1 7 9V6h2V2Z" />
  ),
  analytics: (
    <path d="M3 20h18v2H3v-2Zm2-9h3v7H5v-7Zm5.5-6h3v13h-3V5ZM16 8h3v10h-3V8Z" />
  ),
  reports: (
    <path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.8V8h4.2L13 3.8ZM8 11v2h8v-2H8Zm0 4v2h8v-2H8Zm0 4v2h6v-2H8Z" />
  ),
  staff: (
    <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6.5 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM9 13c-4.4 0-7 2.2-7 5v3h14v-3c0-2.8-2.6-5-7-5Zm6.7.8c1.5 1 2.3 2.5 2.3 4.2v3h4v-2.5c0-2.4-2.2-4.2-6.3-4.7Z" />
  ),
  settings: (
    <path d="m19.4 13 .1-1-.1-1 2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5-.1 1 .1 1-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5ZM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
  ),
  business: (
    <path d="M4 3h16l1 6a3 3 0 0 1-2 2.8V21h-6v-6h-2v6H5v-9.2A3 3 0 0 1 3 9l1-6Zm2 2-.6 4a1 1 0 0 0 2 0L8 5H6Zm4 0-.3 4a1 1 0 0 0 2 0L12 5h-2Zm4 0 .3 4a1 1 0 0 0 2 0L16 5h-2Zm4 0 .6 4a1 1 0 0 0 2 0L20 5h-2Z" />
  ),
  billing: (
    <path d="M5 2 7 3l2-1 2 1 2-1 2 1 2-1 2 1v19l-2-1-2 1-2-1-2 1-2-1-2 1-2-1V2Zm3 5v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z" />
  ),
};

export default function FilledNavIcon({ name, size = 18, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {GLYPHS[name] || GLYPHS.home}
    </svg>
  );
}
