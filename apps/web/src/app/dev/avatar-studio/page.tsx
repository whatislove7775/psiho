"use client";
import { notFound } from "next/navigation";
import { AvatarStudio } from "@/components/avatar-studio/AvatarStudio";
import { DEFAULT_AVATAR } from "@/lib/avatar/schema";
/** Isolated editor QA, with no account writes; unavailable in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16 }}><AvatarStudio initial={DEFAULT_AVATAR} seed="studio-qa" onSave={async () => {}} /></main>;
}
