import React from "react";
import { applyTheme, curDark, store } from "./lib.js";

export default function ThemeBtn() {
  const [dark, setDark] = React.useState(curDark);
  const toggle = () => {
    const t = dark ? "light" : "dark";
    applyTheme(t);
    store.set("mwn:theme", t);
    setDark(!dark);
  };
  const lbl = dark ? "الوضع الفاتح" : "الوضع الغامق";
  return (
    <button className="sq" onClick={toggle} aria-label={lbl} title={lbl}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
