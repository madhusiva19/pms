"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkforceRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/hq-admin/workforce-report");
  }, [router]);
  return null;
}