"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImageIcon, X } from "lucide-react";
import { Button, Spinner } from "@/ui";
import { fetchPrivateFile, type CredentialFileInfo } from "@/lib/api/credentials";
import s from "./credentials.module.css";

/** Loads a document (private ones with the JWT) into an object URL; revokes it on change/unmount. */
export function useDocUrl(file: Pick<CredentialFileInfo, "url"> | null | undefined) {
  const [state, setState] = useState<{ url: string | null; error: string | null; loading: boolean }>({
    url: null,
    error: null,
    loading: false,
  });
  const path = file?.url;
  useEffect(() => {
    if (!path) {
      setState({ url: null, error: null, loading: false });
      return;
    }
    let alive = true;
    let made: string | null = null;
    setState({ url: null, error: null, loading: true });
    fetchPrivateFile(path)
      .then((u) => {
        made = u;
        if (alive) setState({ url: u, error: null, loading: false });
        else URL.revokeObjectURL(u);
      })
      .catch((e) => alive && setState({ url: null, error: (e as Error).message, loading: false }));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  return state;
}

/** One document rendered in place: image fitted into the box, PDF in the built-in viewer. */
export function DocFrame({ file, title }: { file: CredentialFileInfo; title: string }) {
  const { url, error, loading } = useDocUrl(file);
  if (loading) {
    return (
      <div className={s.frameState}>
        <Spinner label="Открываем документ" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <div className={s.frameState}>
        <FileText size={28} strokeWidth={1.6} aria-hidden />
        <p>{error ?? "Не получилось открыть документ."}</p>
      </div>
    );
  }
  if (file.kind === "pdf") {
    return (
      <div className={s.pdfWrap}>
        <iframe className={s.pdf} src={url} title={title} />
        <a className={s.pdfFallback} href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden /> Открыть PDF в новой вкладке
        </a>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={s.frameImg} src={url} alt={title} />;
}

/** Fullscreen lightbox over a list of documents: arrows, ←/→, Esc. */
export function DocViewer({
  files,
  index,
  onClose,
  caption,
}: {
  files: CredentialFileInfo[];
  index: number | null;
  onClose: () => void;
  caption?: ReactNode;
}) {
  const [i, setI] = useState(index ?? 0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (index != null) setI(index);
  }, [index]);
  const open = index != null && files.length > 0;
  const go = useCallback((d: number) => setI((x) => (x + d + files.length) % files.length), [files.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => closeRef.current?.focus(), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, go]);

  const file = open ? files[Math.min(i, files.length - 1)] : null;
  const { url } = useDocUrl(file);
  if (!open || !file || typeof document === "undefined") return null;
  const name = file.name || (file.kind === "pdf" ? "Документ PDF" : "Скан документа");

  return createPortal(
    <div
      className={s.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр документа"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={s.lbBar}>
        <div className={s.lbCaption}>
          {caption && <strong>{caption}</strong>}
          <span>
            {name}
            {files.length > 1 ? `, ${Math.min(i, files.length - 1) + 1} из ${files.length}` : ""}
          </span>
        </div>
        {url && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Открыть отдельно"
            onClick={() => window.open(url, "_blank", "noopener")}
            icon={<ExternalLink size={16} />}
          >
            <span className={s.hideSm}>Открыть отдельно</span>
          </Button>
        )}
        <Button ref={closeRef} variant="ghost" size="sm" iconOnly aria-label="Закрыть" onClick={onClose} icon={<X size={20} />} />
      </div>
      <div className={s.lbStage} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <DocFrame key={file.id} file={file} title={name} />
      </div>
      {files.length > 1 && (
        <>
          <button type="button" className={`${s.lbNav} ${s.lbPrev}`} aria-label="Предыдущий документ" onClick={() => go(-1)}>
            <ChevronLeft size={24} />
          </button>
          <button type="button" className={`${s.lbNav} ${s.lbNext}`} aria-label="Следующий документ" onClick={() => go(1)}>
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Small preview tile: image thumbnail (loaded lazily) or a PDF sheet. */
export function DocTile({
  file,
  onOpen,
  label,
  children,
}: {
  file: CredentialFileInfo;
  onOpen: () => void;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.tile}>
      <button type="button" className={s.tileBtn} onClick={onOpen} aria-label={label ?? `Открыть ${file.name ?? "документ"}`}>
        {file.kind === "image" ? <Thumb file={file} /> : (
          <span className={s.tilePdf} aria-hidden>
            <FileText size={22} strokeWidth={1.7} />
            <b>PDF</b>
          </span>
        )}
      </button>
      {children}
    </div>
  );
}

function Thumb({ file }: { file: CredentialFileInfo }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { url } = useDocUrl(visible ? file : null);
  return (
    <span ref={ref} className={s.tileImg}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <ImageIcon size={20} strokeWidth={1.7} aria-hidden />
      )}
    </span>
  );
}
