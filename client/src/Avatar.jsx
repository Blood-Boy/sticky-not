import React from "react";
import { grad, THEMES } from "./lib.js";

export default function Avatar({ src, name, size, badge }) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  const h = [...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % THEMES.length;
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {src ? <img src={src} alt="" /> : <span className="avi" style={{ background: grad(h) }}>{ch}</span>}
      {badge && <span className="avb" aria-hidden="true">📷</span>}
    </span>
  );
}
