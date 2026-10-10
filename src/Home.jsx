import React from "react";
import { grad, SIG } from "./lib.js";
import { IB, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import ThemeBtn from "./ThemeBtn.jsx";

export default function Home({
  notes,
  myNotes,
  sharedNotes,
  folders,
  sharedFolders,
  folder,
  user,
  avatar,
  inboxCount,
  onProfile,
  count,
  onAdd,
  onNewFolder,
  onAsk,
  onMove,
  onFolderAsk,
  onFolderEdit,
  onCollab,
  onInbox,
  onLogout,
}) {
  // Fallback: if myNotes not passed, use notes
  const ownNotes = myNotes || notes;
  const extraNotes = sharedNotes || [];
  const ownFolders = folders || [];
  const extraFolders = sharedFolders || [];

  const empty = !ownNotes.length && !ownFolders.length && !extraNotes.length && !extraFolders.length;

  return (
    <div>
      <div className="top">
        {folder && (
          <IB n="back" label="رجوع" onClick={() => { location.hash = ""; }} />
        )}
        <button className="ubox" onClick={onProfile} aria-label="صورة الحساب">
          <Avatar src={avatar} name={user} size={40} badge={true} />
          <span className="un">{user}</span>
        </button>
        <span className="sp"></span>
        <ThemeBtn />
        {/* Inbox bell */}
        <button className="sq ibel" onClick={onInbox} aria-label="الإشعارات" title="الإشعارات" style={{ position: "relative" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {inboxCount > 0 && (
            <span className="ibadge">{inboxCount > 9 ? "9+" : inboxCount}</span>
          )}
        </button>
        <button className="sq" onClick={onLogout} aria-label="خروج" title="خروج">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(-1)" }}>
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

        {/* Own folders */}
        {ownFolders.map((f) => (
          <FolderCard
            key={f.id}
            f={f}
            count={count}
            onAsk={onFolderAsk}
            onEdit={onFolderEdit}
            onCollab={onCollab}
          />
        ))}

        {/* Own notes */}
        {ownNotes.map((n) => (
          <NoteCard key={n.id} n={n} onAsk={onAsk} onMove={onMove} onCollab={onCollab} />
        ))}
      </main>

      {/* Shared with me section */}
      {(extraFolders.length > 0 || extraNotes.length > 0) && (
        <>
          <h2 className="sec-head">مشارك معايا</h2>
          <div className="grid">
            {extraFolders.map((f) => (
              <FolderCard key={f.id} f={f} count={count} shared owner={f.owner} onCollab={null} />
            ))}
            {extraNotes.map((n) => (
              <NoteCard key={n.id} n={n} onAsk={null} onMove={null} onCollab={null} shared owner={n.owner} />
            ))}
          </div>
        </>
      )}

      <div className="foot" dir="ltr">{SIG}</div>
    </div>
  );
}

function NoteCard({ n, onAsk, onMove, onCollab, shared, owner }) {
  return (
    <div className="nw">
      <a className="note" href={"#/n/" + n.id}>
        <span className="cov" style={{ background: grad(n.theme) }}></span>
        <div className="nb">
          <h2>{n.title || "من غير اسم"}</h2>
          {shared && owner && (
            <p className="nowner">
              <Avatar src={owner.avatar} name={owner.username} size={14} />
              {" " + owner.username}
            </p>
          )}
          {n.blocks.slice(0, 4).map((b) => (
            <p key={b.id}>{(b.k === "c" ? (b.d ? "✔ " : "○ ") : "") + b.t.slice(0, 90)}</p>
          ))}
        </div>
      </a>
      {onAsk && (
        <button className="cdel" aria-label="احذف النوت" title="احذف النوت" onClick={() => onAsk(n.id)}>
          <Ic n="trash" s={16} />
        </button>
      )}
      {onMove && (
        <button className="cmove" aria-label="انقل النوت" title="انقل النوت" onClick={() => onMove(n.id)}>
          <Ic n="move" s={16} />
        </button>
      )}
      {onCollab && !shared && (
        <button
          className="cshare"
          aria-label="مشاركة النوت"
          title="مشاركة النوت"
          onClick={() => onCollab("note", n.id, n.title || "نوت بدون اسم")}
        >
          <Ic n="userplus" s={16} />
        </button>
      )}
    </div>
  );
}

function FolderCard({ f, count, onAsk, onEdit, onCollab, shared, owner }) {
  return (
    <div className="nw">
      <a className="note fold" href={"#/f/" + f.id}>
        <div className="nb">
          <span className="fic">{f.icon || "📁"}</span>
          <h2>{f.name}</h2>
          {shared && owner && (
            <p className="nowner">
              <Avatar src={owner.avatar} name={owner.username} size={14} />
              {" " + owner.username}
            </p>
          )}
          <p>{count(f.id) + " نوت"}</p>
        </div>
      </a>
      {onAsk && (
        <button className="cdel" aria-label="احذف المجلد" title="احذف المجلد" onClick={() => onAsk(f.id)}>
          <Ic n="trash" s={16} />
        </button>
      )}
      {onEdit && (
        <button className="cmove" aria-label="غيّر الاسم" title="غيّر الاسم" onClick={() => onEdit(f)}>
          <Ic n="edit" s={16} />
        </button>
      )}
      {onCollab && !shared && (
        <button
          className="cshare"
          aria-label="مشاركة المجلد"
          title="مشاركة المجلد"
          onClick={() => onCollab("folder", f.id, f.name)}
        >
          <Ic n="userplus" s={16} />
        </button>
      )}
    </div>
  );
}
