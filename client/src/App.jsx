import React from "react";
import { api, getToken, setToken } from "./api.js";
import Shell from "./Shell.jsx";
import Login from "./Login.jsx";

export default function App() {
  const [user, setUser] = React.useState(null);
  const [booting, setBooting] = React.useState(!!getToken());

  React.useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const me = await api.me();
          setUser(me.username);
        } catch (e) {
          setToken(null);
        } finally {
          setBooting(false);
        }
      } else {
        setBooting(false);
      }
    })();
  }, []);

  if (booting) {
    return (
      <p className="empty" style={{ padding: "80px 0" }}>
        بنتظر...
      </p>
    );
  }

  return user ? (
    <Shell
      key={user}
      user={user}
      onLogout={() => {
        setToken(null);
        location.hash = "";
        setUser(null);
      }}
    />
  ) : (
    <Login onEnter={setUser} />
  );
}
