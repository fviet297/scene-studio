import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  title?: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Native <dialog> in showModal mode; closes on Esc (the browser) and backdrop click. */
export const Dialog = ({ title, wide, onClose, children, footer }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`dialog${wide ? " wide" : ""}`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-form">
        {title ? (
          <header className="dialog-head">
            <h2>{title}</h2>
            <button type="button" className="btn sm quiet" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </header>
        ) : null}
        {children}
        {footer ? <div className="dialog-actions">{footer}</div> : null}
      </div>
    </dialog>
  );
};
