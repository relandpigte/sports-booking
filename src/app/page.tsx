import { redirect } from "next/navigation";

// bunal.ph lands on the hub directory, not a login form: the courts are the
// product, and browsing them needs no account. PageShell gives a signed-in
// visitor their usual chrome and everyone else the public top bar, so this is
// the right door for both.
export default function Home() {
  redirect("/hubs");
}
