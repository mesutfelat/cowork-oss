import React from "react";

interface ThemeIconProps {
  emoji: string;
  icon: React.ReactNode;
  className?: string;
}

export function ThemeIcon({ emoji, icon, className }: ThemeIconProps) {
  return (
    <span className={className} aria-hidden="true">
      <span className="terminal-only">{emoji}</span>
      <span className="modern-only">{icon}</span>
    </span>
  );
}
