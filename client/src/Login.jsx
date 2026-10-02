import React from "react";
import { api, setToken } from "./api.js";
import { SIG, store } from "./lib.js";
import { IB } from "./ui.jsx";
import ThemeBtn from "./ThemeBtn.jsx";

const RECENT_KEY = "mwn:recent";

export default function Login({ onEnter }) {
  const [name, setName] = React.useState("");
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
    setBusy(true);
    setMsg("");
    try {
      const data = mode === "login" ? await api.login(c) : await api.register(c);
      setToken(data.token);
      pushRecent(c);
      onEnter(c);
    } catch (err) {
      if (err.message === "exists") setMsg("اليوزر ده موجود. اضغط دخول.");
      else if (err.message === "notfound") setMsg("اليوزر ده مش مسجل. اضغط تسجيل حساب جديد.");
      else if (err.message === "badname") setMsg("اليوزر من 2 لـ 20 حرف.");
      else setMsg("حصلت مشكلة في الاتصال. اتأكد إن السيرفر شغال وجرّب تاني.");
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
        <div className="bar">
          <IB type="submit" c="main" n="login" label="دخول" disabled={busy} />
          <IB n="userplus" label="تسجيل حساب جديد" disabled={busy} onClick={() => go("register")} />
        </div>
        <p className="msg">{msg || "اكتب اليوزر بس، من غير باسورد"}</p>
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
