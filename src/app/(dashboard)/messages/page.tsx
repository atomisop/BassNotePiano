import { redirect } from "next/navigation";

// Student-to-student chat is gone. Writing to the team now lives in the bell (Inbox > Support); an old link just lands on Home.
export default function MessagesPage() {
  redirect("/dashboard");
}
