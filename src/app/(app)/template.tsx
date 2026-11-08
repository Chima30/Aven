/**
 * Re-mounts on every navigation inside the signed-in area, so each page
 * arrives with the same short fade-and-rise (disabled under reduced motion).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
