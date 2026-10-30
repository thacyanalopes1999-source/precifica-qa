import type { ReactNode } from "react";

export const instant = false;

export default function ComparisonLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
