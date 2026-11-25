import type { ReactNode } from "react";
import { Boundary } from "./Boundary";

// The last line of defence around the whole app: if everything else failed, a plain page that
// says so in both languages and offers a reload. The page is never blank.
export function AppBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      name="app"
      fallback={(_retry, reported) => (
        <div className="offline">
          <div>
            <h1 className="display">Spear Analytics couldn't show this page.</h1>
            <p className="muted" lang="en">
              A fault in the page, not in the data.{" "}
              {reported === null ? "Reporting it…" : reported ? "It has been reported." : "It couldn't be reported (not signed in, or Spear is offline)."}
            </p>
            <p className="muted" lang="ar" dir="rtl">
              تعذّر على تحليلات رمح عرض هذه الصفحة: خلل في الصفحة لا في البيانات.{" "}
              {reported === null ? "جارٍ الإبلاغ عنه…" : reported ? "وقد أُبلغ عنه." : "وتعذّر الإبلاغ عنه (لم تسجّل الدخول، أو رمح غير متصل)."}
            </p>
            <button className="primary" onClick={() => window.location.reload()}>
              Reload · أعد التحميل
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}
