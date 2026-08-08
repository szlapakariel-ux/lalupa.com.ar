import { savePublicExperience } from "@/server/actions/public-programming";
import { Card, Field, PageTitle, buttonClass, inputClass } from "@/components/ui";

type Item = { id:string; category:string; title:string; guides:string; description:string; status:string; details:string|null; ctaLabel:string|null; ctaUrl:string|null; position:number; published:boolean; schedules:{audience:string|null;text:string}[] };
export function ExperienceForm({item}:{item?:Item}) {
  const schedules = item?.schedules.map(s => `${s.audience ? `${s.audience}|` : ""}${s.text}`).join("\n") ?? "";
  return <div className="space-y-4"><PageTitle title={item ? "Editar experiencia":"Nueva experiencia"}/><Card><form action={savePublicExperience} className="space-y-4">
    {item && <input type="hidden" name="id" value={item.id}/>} 
    <div className="grid gap-4 md:grid-cols-2"><Field label="Categoría" required><input name="category" required maxLength={60} defaultValue={item?.category} className={inputClass()}/></Field><Field label="Estado" required><select name="status" defaultValue={item?.status ?? "PROXIMAMENTE"} className={inputClass()}><option value="ACTIVA">Activa</option><option value="PROXIMA">Próxima</option><option value="PROXIMAMENTE">Próximamente</option></select></Field></div>
    <Field label="Título" required><input name="title" required maxLength={120} defaultValue={item?.title} className={inputClass()}/></Field>
    <Field label="Guiado por" required><input name="guides" required maxLength={160} defaultValue={item?.guides} className={inputClass()}/></Field>
    <Field label="Descripción" required><textarea name="description" required maxLength={1000} rows={4} defaultValue={item?.description} className={inputClass()}/></Field>
    <Field label="Fechas y horarios" hint="Una línea por horario. Usá Público|Horario, por ejemplo: Adultos|Miércoles 18:30–20:30 h"><textarea name="schedules" rows={5} defaultValue={schedules} className={inputClass()}/></Field>
    <Field label="Detalle adicional"><input name="details" maxLength={300} defaultValue={item?.details ?? ""} placeholder="Grupos reducidos" className={inputClass()}/></Field>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Texto del botón"><input name="ctaLabel" maxLength={60} defaultValue={item?.ctaLabel ?? ""} className={inputClass()}/></Field><Field label="Enlace del botón"><input name="ctaUrl" type="url" defaultValue={item?.ctaUrl ?? ""} placeholder="https://wa.me/..." className={inputClass()}/></Field></div>
    <Field label="Orden"><input name="position" type="number" min="0" max="999" defaultValue={item?.position ?? 0} className={inputClass()}/></Field>
    <div className="flex flex-wrap gap-2"><button name="intent" value="draft" className={buttonClass("secondary")}>Guardar borrador</button><button name="intent" value="publish" className={buttonClass("primary")}>{item?.published ? "Guardar y mantener publicada":"Publicar"}</button></div>
  </form></Card></div>;
}
