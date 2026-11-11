import type { Studio } from "../useStudio.ts";

export const JobBar = ({ studio }: { studio: Studio }) => {
  const { jobs } = studio;
  const running = jobs[0];
  const queued = jobs.length - 1;
  const state = running ? "running" : "idle";
  const total = running ? running.scenes.length : 0;
  const done = running ? running.done.length : 0;

  return (
    <footer className="jobbar" data-state={state} title={running?.lastLog}>
      <span className="job-dot" />
      <span className="job-label">{running ? running.label : "Không có job"}</span>
      <span className="job-message">{running ? running.lastLog || "đang chạy…" : "sẵn sàng"}</span>
      {running && total ? (
        <span className="num">
          {done}/{total}
        </span>
      ) : null}
      {queued > 0 ? <span className="job-queued">+{queued} trong hàng chờ</span> : null}
      {running ? (
        <button type="button" className="btn sm quiet" onClick={() => void studio.actions.cancelJob(running.id)}>
          Huỷ
        </button>
      ) : null}
    </footer>
  );
};
