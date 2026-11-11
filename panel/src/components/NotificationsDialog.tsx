import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { NotificationItem } from "../types.ts";
import { Dialog } from "./Dialog.tsx";

export const NotificationsDialog = ({ onClose }: { onClose: () => void }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => {
    void api.notifications().then((body) => setItems(body.items));
  };
  useEffect(() => {
    load();
  }, []);

  const clear = () => {
    void api.clearNotifications().then((body) => setItems(body.items));
  };

  return (
    <Dialog
      title="Thông báo"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn danger" disabled={!items.length} onClick={clear}>
            Xoá hết
          </button>
        </>
      }
    >
      <div className="notif-list">
        {items.map((item) => (
          <p key={item.id} className="notif-item">
            {item.message}
          </p>
        ))}
        {!items.length ? <p className="hint">Chưa có thông báo nào.</p> : null}
      </div>
    </Dialog>
  );
};
