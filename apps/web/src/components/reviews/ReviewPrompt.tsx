"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/ui";
import { reviewsApi } from "@/lib/api/reviews";
import { ReviewModal } from "./ReviewModal";
import s from "./reviews.module.css";

/**
 * Client's end-of-call nudge: shown only when a review is possible and not written yet.
 * The call may be marked completed a bit later, so eligibility is re-checked a few times.
 */
export function ReviewPrompt({ psychologistId, name }: { psychologistId: number; name: string }) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!psychologistId) return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      reviewsApi
        .eligibility(psychologistId)
        .then((e) => {
          if (!alive) return;
          if (e.can_review && !e.review) setShow(true);
          else if (!e.can_review && ++tries < 6) timer = setTimeout(check, 10_000);
        })
        .catch(() => {});
    };
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [psychologistId]);

  if (!show || done) return null;
  return (
    <div className={s.prompt}>
      <strong>{t("Как\u00a0вам специалист?")}</strong>
      <p>{t("Анонимный отзыв поможет другим людям решиться на\u00a0первый созвон")}</p>
      <Button variant="primary" size="sm" icon={<PenLine size={16} />} onClick={() => setOpen(true)}>
        {t("Оставить отзыв")}
      </Button>
      <ReviewModal
        open={open}
        psychologistId={psychologistId}
        name={name}
        onClose={() => setOpen(false)}
        onSaved={(r) => r && setDone(true)}
      />
    </div>
  );
}
