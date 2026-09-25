"use client";

import { useEffect, useState } from "react";
import { Camera, PhoneCall, Radio, ScanFace, Waves, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/AppShell";
import { LabGuide } from "./LabGuide";
import { TestCallPanel } from "./TestCallPanel";
import { AvatarPlayground } from "./AvatarPlayground";
import { VoicePanel } from "./VoicePanel";
import { DevicesPanel } from "./DevicesPanel";
import { NetworkPanel } from "./NetworkPanel";
import s from "./lab.module.css";

type Tab = "call" | "avatar" | "voice" | "devices" | "network";

const TABS: { id: Tab; label: string; icon: LucideIcon; tone: string }[] = [
  { id: "call", label: "Тестовый звонок", icon: PhoneCall, tone: "sky" },
  { id: "avatar", label: "Аватар и маска", icon: ScanFace, tone: "lilac" },
  { id: "voice", label: "Голос", icon: Waves, tone: "peach" },
  { id: "devices", label: "Устройства", icon: Camera, tone: "mint" },
  { id: "network", label: "Сеть", icon: Radio, tone: "butter" },
];

const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

export function LabPage() {
  const [tab, setTabState] = useState<Tab>("call");

  // The tab lives in the URL hash (/admin/lab#avatar) so a link can open a section.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTabState(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // Keep the active pill visible in the horizontally scrolling tab row (phones).
  useEffect(() => {
    const row = document.getElementById("lab-tabs");
    const el = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (row && el) row.scrollLeft = Math.max(0, el.offsetLeft - row.offsetLeft - 16);
  }, [tab]);

  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <>
      <PageHeader
        title="Лаборатория"
        sub="Проверка звонков, аватаров, голоса и сети без записи на созвон. Ничего отсюда не попадает в статистику и никуда не записывается."
      />
      <div className={s.lab}>
        <LabGuide
          onTab={(t) => {
            setTab(t);
            document.getElementById("lab-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <div className={s.tabs} role="tablist" aria-label="Разделы лаборатории" id="lab-tabs">
          {TABS.map(({ id, label, icon: Icon, tone }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`lab-${id}`}
              className={s.tab}
              data-tone={tone}
              onClick={() => setTab(id)}
            >
              <span className={s.tabIcon}>
                <Icon size={16} />
              </span>
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`lab-${tab}`}>
          {tab === "call" && <TestCallPanel />}
          {tab === "avatar" && <AvatarPlayground />}
          {tab === "voice" && <VoicePanel />}
          {tab === "devices" && <DevicesPanel />}
          {tab === "network" && <NetworkPanel />}
        </div>
      </div>
    </>
  );
}
