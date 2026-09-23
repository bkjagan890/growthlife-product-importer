import { createContext, useContext, type ReactNode } from "react";

export type Page = "products" | "import" | "export" | "images";

export const NavContext = createContext<(p: Page) => void>(() => undefined);
export const useNav = () => useContext(NavContext);

export function NavLink({ to, className, children }: { to: Page; className?: string; children: ReactNode }) {
  const go = useNav();
  return (
    <button type="button" className={className} onClick={() => go(to)}>
      {children}
    </button>
  );
}
