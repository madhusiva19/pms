import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    "https://yqdrcdkqwiqtmbyuntwk.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxZHJjZGtxd2lxdG1ieXVudHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NDkwMzUsImV4cCI6MjA4NjUyNTAzNX0.l7tCKgIf2wTNPqRcareeOnHATr-XqF-wS68mzQ1gDZQ"
  );
}