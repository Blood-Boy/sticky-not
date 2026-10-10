import React from "react";
import { api, setToken } from "./api.js";
import { SIG, store } from "./lib.js";
import { IB } from "./ui.jsx";
import ThemeBtn from "./ThemeBtn.jsx";

const RECENT_KEY = "mwn:recent";

export default function Login({ onEnter }) {
  const [name, setName] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const recents = store.get(RECENT_KEY, []);

  function pushRecent(u) {
    const r = [u, ...store.get(RECENT_KEY, []).filter((x) => x !== u)].slice(0, 6);
    store.set(RECENT_KEY, r);
  }

  async function go(mode, e) {
    if (e) e.preventDefault();
    if (busy) return;
    const c = name.trim();
    if (!/^[\w\u0600-\u06FF.\- ]{2,20}$/.test(c)) {
      setMsg("اليوزر من 2 لـ 20 حرف (حروف وأرقام ونقطة وشرطة).");
      return;
    }
    if (!pass) {
      setMsg("اكتب الباسورد.");
      return;
    }
    if (mode === "register" && pass.length < 6) {
      setMsg("الباسورد لازم يكون 6 حروف على الأقل.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = mode === "login" ? await api.login(c, pass) : await api.register(c, pass);
      setToken(data.token);
      pushRecent(c);
      onEnter(c);
    } catch (err) {
      if (err.message === "exists") setMsg("اليوزر ده موجود. اضغط دخول.");
      else if (err.message === "badcreds") setMsg("اليوزر أو الباسورد غلط.");
      else if (err.message === "badpass") setMsg("الباسورد من 6 لـ 128 حرف.");
      else if (err.message === "badname") setMsg("اليوزر من 2 لـ 20 حرف.");
      else if (err.message === "toomany") setMsg("محاولات كتير غلط. استنى شوية وجرّب تاني.");
      else if (err.message === "nopassword")
        setMsg("الحساب ده اتعمل قبل الباسورد. حط له باسورد بـ server/set-password.js (الشرح في README).");
      else if (err.message === "network")
        setMsg("مقدرتش أوصل للسيرفر. اتأكد من النت وجرّب تاني.");
      else if (err.message === "server" || err.message === "badjson")
        setMsg("في مشكلة في السيرفر. جرّب تاني بعد شوية.");
      else setMsg("حصلت مشكلة. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="lt">
        <ThemeBtn />
      </div>
      <form className="login" onSubmit={(e) => go("login", e)}>
        <h1 dir="ltr">my work note</h1>
        <input
          value={name}
          placeholder="اليوزر"
          autoComplete="username"
          autoFocus
          onInput={(e) => {
            setName(e.target.value);
            setMsg("");
          }}
        />
        <input
          type="password"
          value={pass}
          placeholder="الباسورد"
          autoComplete="current-password"
          maxLength={128}
          onInput={(e) => {
            setPass(e.target.value);
            setMsg("");
          }}
        />
        <div className="bar">
          <IB type="submit" c="main" n="login" label="دخول" disabled={busy} />
          <IB n="userplus" label="تسجيل حساب جديد" disabled={busy} onClick={() => go("register")} />
        </div>
        <p className="msg">{msg || "اكتب اليوزر والباسورد"}</p>
        {recents.length > 0 && (
          <div className="chips">
            {recents.map((u) => (
              <button type="button" key={u} onClick={() => setName(u)}>
                {u}
              </button>
            ))}
          </div>
        )}
        <div className="foot" dir="ltr">
          {SIG}
        </div>
      </form>
    </>
  );
}
