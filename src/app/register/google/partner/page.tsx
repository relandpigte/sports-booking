import { redirect } from "next/navigation";

export default function LegacyGooglePartnerRegistrationPage() {
  redirect("/register/google?role=partner");
}
