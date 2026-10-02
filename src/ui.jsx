import React from "react";

export const IC = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  trash:
    '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  move: '<path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  back: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  folderplus:
    '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2zM12 11v6M9 14h6"/>',
  list: '<path d="M10 6h11M10 12h11M10 18h11M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 10M3 18l1.5 1.5L7 16"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  share:
    '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  login:
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  userplus:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6"/>',
};

export function Ic({ n, s }) {
  const z = s || 20;
  return (
    <svg
      width={z}
      height={z}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IC[n] }}
    />
  );
}

export function IB({ n, label, c, onClick, type, disabled }) {
  return (
    <button
      type={type || "button"}
      className={"btn ic " + (c || "")}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Ic n={n} />
    </button>
  );
}

export function TA({ value, onInput, r }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const e = ref.current;
    if (e) {
      e.style.height = "auto";
      e.style.height = e.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      className="bt"
      rows="1"
      placeholder="اكتب هنا..."
      value={value}
      onInput={onInput}
      ref={(el) => {
        ref.current = el;
        if (r) r(el);
      }}
    />
  );
}

export function Modal({ onClose, children }) {
  React.useEffect(
    () => {
      const f = (e) => {
        if (e.key === "Escape") onClose();
      };
      addEventListener("keydown", f);
      return () => removeEventListener("keydown", f);
    },
    [onClose]
  );
  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="box" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
