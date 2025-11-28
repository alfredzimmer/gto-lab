"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export async function signInWithGithub() {
  const supabase = await createClient();
  const headersList = await headers();
  const host = headersList.get("host");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `https://${host}/auth/callback`,
    },
  });

  if (error) {
    redirect("/login?error=Could not authenticate user");
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
