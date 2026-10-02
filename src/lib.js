export const SIG = "P4K BILAL TEAM";

export const THEMES = [
  ["#FFFFFF", "#DDEBF1"],
  ["#E7F3F8", "#FFFFFF", "#A9D4EC"],
  ["#EDF3EC", "#FFFFFF", "#A8DDBA"],
  ["#FBF3DB", "#FFFFFF", "#FFDC8A"],
  ["#FAEBDD", "#FFFFFF", "#FFC08A"],
  ["#F6F3F9", "#FFFFFF", "#C9B6F2"],
  ["#FAF1F5", "#FFFFFF", "#F5B3D1"],
  ["#FDEBEC", "#FFFFFF", "#FFA9A4"],
  ["#F1F1EF", "#FFFFFF", "#D9D7D2"],
  ["#E7F3F8", "#EDF3EC", "#FBF3DB"],
  ["#DDEBF1", "#F6F3F9", "#FAF1F5"],
  ["#FFDC8A", "#FFC08A", "#FFA9A4"],
];

export const grad = (t) =>
  "linear-gradient(160deg," + THEMES[t % THEMES.length].join(",") + ")";

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};

export function norm(n) {
  let b = n.blocks;
  if (!b) {
    b = (n.items || []).map((i) => ({ k: "c", t: i.t, d: !!i.d }));
    if (n.text) b.push({ k: "p", t: n.text });
  }
  return {
    id: n.id || uid(),
    title: n.title || "",
    folder: n.folder || null,
    theme: n.theme || 0,
    blocks: b.map((x) => ({
      id: x.id || uid(),
      k: x.k === "c" ? "c" : "p",
      t: x.t || "",
      d: !!x.d,
    })),
  };
}

export function wrap(ctx, text, max) {
  const out = [];
  String(text)
    .split("\n")
    .forEach((p) => {
      let line = "";
      p.split(" ").forEach((w) => {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > max && line) {
          out.push(line);
          line = w;
        } else {
          line = t;
        }
      });
      out.push(line);
    });
  return out;
}

export async function makeImage(n) {
  try {
    await document.fonts.load('600 40px "Readex Pro"');
  } catch (e) {}
  const W = 1080,
    F = '"Readex Pro",Tahoma,Arial,sans-serif',
    R = W - 100,
    max = W - 200;
  const c = document.createElement("canvas"),
    x = c.getContext("2d");
  x.font = "600 68px " + F;
  const tl = wrap(x, n.title || "من غير اسم", max);
  const items = n.blocks.filter((b) => b.t.trim());
  const lay = (s) => {
    const fs = 44 * s,
      LH = 70 * s,
      PAD = 24 * s,
      BX = 66 * s;
    x.font = "400 " + fs + "px " + F;
    let tot = 0;
    const L = items.map((b, i) => {
      const isC = b.k === "c",
        ls = wrap(x, b.t, max - (isC ? BX : 0)),
        h = ls.length * LH;
      tot += h + (i < items.length - 1 ? PAD : 0);
      return { b, isC, ls, h };
    });
    return { L, tot, fs, LH, PAD, BX };
  };
  let H = 1350;
  const bodyY = 160 + tl.length * 92,
    avail = H - 190 - bodyY;
  let s = 1,
    r = lay(s);
  while (r.tot > avail && s > 0.5) {
    s = Math.round((s - 0.04) * 100) / 100;
    r = lay(s);
  }
  if (r.tot > avail) H += Math.ceil(r.tot - avail);
  c.width = W;
  c.height = H;
  const g = x.createLinearGradient(0, 0, W * 0.4, H),
    th = THEMES[n.theme % THEMES.length];
  th.forEach((col, i) => g.addColorStop(i / (th.length - 1), col));
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.direction = "rtl";
  x.textAlign = "right";
  x.textBaseline = "top";
  x.fillStyle = "#37352F";
  x.font = "600 68px " + F;
  let y = 110;
  tl.forEach((l) => {
    x.fillText(l, R, y);
    y += 92;
  });
  y += 10;
  x.fillStyle = "rgba(55,53,47,.25)";
  x.fillRect(100, y, W - 200, 3);
  y = bodyY;
  x.font = "400 " + r.fs + "px " + F;
  r.L.forEach((it, k) => {
    const { b, isC, ls, h } = it,
      tr = isC ? R - r.BX : R;
    if (isC) {
      const z = 40 * s,
        bx = R - z,
        by = y + 6 * s;
      x.beginPath();
      if (x.roundRect) x.roundRect(bx, by, z, z, 0.225 * z);
      else x.rect(bx, by, z, z);
      x.lineWidth = 4 * s;
      if (b.d) {
        x.fillStyle = "#2383E2";
        x.fill();
        x.strokeStyle = "#2383E2";
      } else x.strokeStyle = "#37352F";
      x.stroke();
      if (b.d) {
        x.strokeStyle = "#fff";
        x.lineWidth = 5 * s;
        x.lineCap = "round";
        x.lineJoin = "round";
        x.beginPath();
        x.moveTo(bx + 0.225 * z, by + 0.525 * z);
        x.lineTo(bx + 0.425 * z, by + 0.725 * z);
        x.lineTo(bx + 0.775 * z, by + 0.3 * z);
        x.stroke();
      }
    }
    x.globalAlpha = isC && b.d ? 0.55 : 1;
    x.fillStyle = "#37352F";
    ls.forEach((l, i) => {
      const ty = y + i * r.LH;
      x.fillText(l, tr, ty);
      if (isC && b.d) {
        const w = x.measureText(l).width;
        x.fillRect(tr - w, ty + r.LH * 0.46, w, Math.max(2, 3 * s));
      }
    });
    x.globalAlpha = 1;
    y += h + r.PAD;
    if (k < r.L.length - 1) {
      x.fillStyle = "rgba(55,53,47,.2)";
      x.fillRect(100, y - r.PAD / 2, W - 200, 2);
    }
  });
  x.fillStyle = "rgba(55,53,47,.2)";
  x.fillRect(100, H - 150, W - 200, 2);
  x.direction = "ltr";
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.font = "600 36px " + F;
  x.fillStyle = "#1F6FBF";
  if (x.letterSpacing !== undefined) x.letterSpacing = "6px";
  x.fillText(SIG, W / 2, H - 70);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export function readAvatar(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = () => {
        const S = 160,
          c = document.createElement("canvas");
        c.width = c.height = S;
        const z = Math.min(im.width, im.height);
        c.getContext("2d").drawImage(
          im,
          (im.width - z) / 2,
          (im.height - z) / 2,
          z,
          z,
          0,
          0,
          S,
          S
        );
        res(c.toDataURL("image/jpeg", 0.85));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export const ICONS = [
  "📁", "⭐", "💼", "📚", "🏠", "💡", "🎯", "🛒",
  "✈️", "🎵", "💰", "❤️", "🌸", "🎨",
];

export function applyTheme(t) {
  const r = document.documentElement;
  if (t === "dark" || t === "light") r.setAttribute("data-theme", t);
  else r.removeAttribute("data-theme");
}

export function curDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t
    ? t === "dark"
    : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
}
