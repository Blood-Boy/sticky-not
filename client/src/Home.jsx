import React from "react";
import { grad, SIG } from "./lib.js";
import { IB, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import ThemeBtn from "./ThemeBtn.jsx";

export default function Home({
  notes,
  folders,
  folder,
  user,
  avatar,
  onProfile,
  count,
  onAdd,
  onNewFolder,
  onAsk,
  onMove,
  onFolderAsk,
  onFolderEdit,
  onLogout,
}) {
  const empty = !notes.length && !folders.length;
  return (
    <div>
      <div className="top">
        {folder && (
          <IB
            n="back"
            label="رجوع"
            onClick={() => {
              location.hash = "";
            }}
          />
        )}
        <button className="ubox" onClick={onProfile} aria-label="صورة الحساب">
          <Avatar src={avatar} name={user} size={40} badge={true} />
          <span className="un">{user}</span>
        </button>
        <span className="sp"></span>
        <ThemeBtn />
        <button className="sq" onClick={onLogout} aria-label="خروج" title="خروج">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "scaleX(-1)" }}
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
      {folder ? (
        <h1>{(folder.icon || "📁") + " " + folder.name}</h1>
      ) : (
        <h1>📝 my work note</h1>
      )}
      <main className="grid">
        <button className="add" aria-label="نوت جديدة" title="نوت جديدة" onClick={onAdd}>
          <Ic n="plus" s={34} />
        </button>
        {!folder && (
          <button className="add addf" aria-label="مجلد جديد" title="مجلد جديد" onClick={onNewFolder}>
            <Ic n="folderplus" s={34} />
          </button>
        )}
        {empty && (
          <p className="empty">{folder ? "المجلد فاضي. دوس + وضيف نوت" : "دوس على + وابدأ أول نوت"}</p>
        )}
        {folders.map((f) => (
          <div className="nw" key={f.id}>
            <a className="note fold" href={"#/f/" + f.id}>
              <div className="nb">
                <span className="fic">{f.icon || "📁"}</span>
                <h2>{f.name}</h2>
                <p>{count(f.id) + " نوت"}</p>
              </div>
            </a>
            <button className="cdel" aria-label="احذف المجلد" title="احذف المجلد" onClick={() => onFolderAsk(f.id)}>
              <Ic n="trash" s={16} />
            </button>
            <button className="cmove" aria-label="غيّر الاسم" title="غيّر الاسم" onClick={() => onFolderEdit(f)}>
              <Ic n="edit" s={16} />
            </button>
          </div>
        ))}
        {notes.map((n) => (
          <div className="nw" key={n.id}>
            <a className="note" href={"#/n/" + n.id}>
              <span className="cov" style={{ background: grad(n.theme) }}></span>
              <div className="nb">
                <h2>{n.title || "من غير اسم"}</h2>
                {n.blocks
                  .slice(0, 4)
                  .map((b) => (
                    <p key={b.id}>
                      {(b.k === "c" ? (b.d ? "✔ " : "○ ") : "") + b.t.slice(0, 90)}
                    </p>
                  ))}
              </div>
            </a>
            <button className="cdel" aria-label="احذف النوت" title="احذف النوت" onClick={() => onAsk(n.id)}>
              <Ic n="trash" s={16} />
            </button>
            <button className="cmove" aria-label="انقل النوت" title="انقل النوت" onClick={() => onMove(n.id)}>
              <Ic n="move" s={16} />
            </button>
          </div>
        ))}
      </main>
      <div className="foot" dir="ltr">
        {SIG}
      </div>
    </div>
  );
}
