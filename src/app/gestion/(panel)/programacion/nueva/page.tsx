import { requirePageUser } from "@/server/auth/require-user";
import { ExperienceForm } from "../experience-form";
export default async function NuevaPage(){ await requirePageUser("ADMIN"); return <ExperienceForm />; }
