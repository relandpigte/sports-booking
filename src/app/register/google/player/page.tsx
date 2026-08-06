import { redirect } from "next/navigation";

export default function LegacyGooglePlayerRegistrationPage() {
  redirect("/register/google?role=player");
}
