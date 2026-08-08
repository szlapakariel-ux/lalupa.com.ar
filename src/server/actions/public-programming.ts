"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, clientIp } from "@/server/auth/require-user";
import { audit } from "@/server/services/audit";

const schema = z.object({
  category: z.string().min(1).max(60), title: z.string().min(1).max(120),
  guides: z.string().min(1).max(160), description: z.string().min(1).max(1000),
  status: z.enum(["ACTIVA", "PROXIMA", "PROXIMAMENTE"]),
  details: z.string().max(300).optional(), ctaLabel: z.string().max(60).optional(),
  ctaUrl: z.union([z.string().url().refine(v => v.startsWith("https://") || v.startsWith("http://"), "El enlace debe comenzar con https:// o http://"), z.literal("")]).optional(), position: z.coerce.number().int().min(0).max(999),
});

const value = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const schedulesFrom = (raw: string) => raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, position) => {
  const split = line.indexOf("|");
  return { audience: split < 0 ? null : line.slice(0, split).trim() || null, text: (split < 0 ? line : line.slice(split + 1)).trim(), position };
}).filter((row) => row.text);

export async function savePublicExperience(formData: FormData) {
  const user = await requireUser("ADMIN");
  const id = value(formData, "id");
  const parsed = schema.parse({
    category: value(formData, "category"), title: value(formData, "title"), guides: value(formData, "guides"),
    description: value(formData, "description"), status: value(formData, "status"), details: value(formData, "details"),
    ctaLabel: value(formData, "ctaLabel"), ctaUrl: value(formData, "ctaUrl"), position: value(formData, "position") || "0",
  });
  const schedules = schedulesFrom(value(formData, "schedules"));
  const data = { ...parsed, details: parsed.details || null, ctaLabel: parsed.ctaLabel || null, ctaUrl: parsed.ctaUrl || null,
    published: value(formData, "intent") === "publish", updatedById: user.id };
  const experience = await prisma.$transaction(async (tx) => {
    const record = id ? await tx.publicExperience.update({ where: { id }, data }) : await tx.publicExperience.create({ data });
    await tx.publicExperienceSchedule.deleteMany({ where: { experienceId: record.id } });
    if (schedules.length) await tx.publicExperienceSchedule.createMany({ data: schedules.map((s) => ({ ...s, experienceId: record.id })) });
    await audit(tx, { userId: user.id, action: id ? "publicExperience.update" : "publicExperience.create", entity: "PublicExperience", entityId: record.id, metadata: { title: record.title, published: record.published }, ip: await clientIp() });
    return record;
  });
  revalidatePath("/gestion/programacion");
  redirect(`/gestion/programacion/${experience.id}?saved=1&published=${experience.published ? "1" : "0"}`);
}

export async function savePublicExperienceDraft(formData: FormData) {
  formData.set("intent", "draft");
  return savePublicExperience(formData);
}

export async function publishPublicExperience(formData: FormData) {
  formData.set("intent", "publish");
  return savePublicExperience(formData);
}

export async function uploadPublicImages(formData: FormData) {
  const user = await requireUser("ADMIN");
  const experienceId = value(formData, "experienceId");
  const files = formData.getAll("images").filter((x): x is File => x instanceof File && x.size > 0);
  if (!files.length) return;
  if (files.length > 12) throw new Error("Podés subir hasta 12 imágenes por vez.");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  for (const file of files) {
    if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Cada imagen debe ser JPG, PNG o WebP y pesar hasta 5 MB.");
  }
  const exists = await prisma.publicExperience.findUnique({ where: { id: experienceId }, select: { id: true } });
  if (!exists) throw new Error("La experiencia no existe.");
  const count = await prisma.publicExperienceImage.count({ where: { experienceId } });
  await prisma.$transaction(async (tx) => {
    for (const [index, file] of files.entries()) await tx.publicExperienceImage.create({ data: { experienceId, data: Buffer.from(await file.arrayBuffer()), mimeType: file.type, alt: value(formData, "alt") || null, position: count + index, isCover: count === 0 && index === 0 } });
    await audit(tx, { userId: user.id, action: "publicExperience.images.upload", entity: "PublicExperience", entityId: experienceId, metadata: { count: files.length }, ip: await clientIp() });
  });
  revalidatePath(`/gestion/programacion/${experienceId}`);
  revalidatePath("/api/programacion");
  redirect(`/gestion/programacion/${experienceId}?images=uploaded&count=${files.length}`);
}

export async function imageAction(formData: FormData) {
  const user = await requireUser("ADMIN");
  const imageId = value(formData, "imageId"), intent = value(formData, "intent");
  const image = await prisma.publicExperienceImage.findUnique({ where: { id: imageId }, select: { experienceId: true } });
  if (!image) return;
  await prisma.$transaction(async (tx) => {
    if (intent === "cover") { await tx.publicExperienceImage.updateMany({ where: { experienceId: image.experienceId }, data: { isCover: false } }); await tx.publicExperienceImage.update({ where: { id: imageId }, data: { isCover: true } }); }
    if (intent === "delete") await tx.publicExperienceImage.delete({ where: { id: imageId } });
    await audit(tx, { userId: user.id, action: `publicExperience.image.${intent}`, entity: "PublicExperienceImage", entityId: imageId, metadata: { experienceId: image.experienceId }, ip: await clientIp() });
  });
  revalidatePath(`/gestion/programacion/${image.experienceId}`);
}

export async function bootstrapPublicProgramming() {
  const user = await requireUser("ADMIN");
  if (await prisma.publicExperience.count()) return;
  const rows = [
    { category:"Ilustración", title:"Ilustración y narrativa visual", guides:"Anita Dominoni", description:"Dibujo, scrapbook, personajes e historias para crear tu propio universo visual. Incluye materiales para trabajar en el salón.", status:"ACTIVA" as const, details:"Grupos reducidos", position:0, published:true, schedules:[{audience:"Adultos",text:"Miércoles 18:30–20:30 h",position:0},{audience:"Adultos",text:"Viernes 18:30–20:30 h",position:1},{audience:"Niños",text:"Sábados 14:00–16:00 h",position:2}] },
    { category:"Cerámica", title:"Cerámica inicial sin horno", guides:"Anita Dominoni", description:"Para todos los niveles. Materiales no tóxicos, fáciles de moldear y personalizables con pintura y barniz.", status:"PROXIMA" as const, details:"Grupos reducidos", ctaLabel:"Avisarme", ctaUrl:"https://wa.me/5491154204111?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20Espacio%20La%20Lupa.", position:1, published:true, schedules:[{audience:null,text:"Fechas a confirmar",position:0}] },
    { category:"Tecnología", title:"IA para perderle el miedo a la tecnología", guides:"Ariel Szlapak y Leonardo Goicoechea", description:"Una experiencia para descubrir, sin tecnicismos, cómo usar IA en la vida diaria, el trabajo o los proyectos personales.", status:"PROXIMAMENTE" as const, details:"A confirmar · Cupos reducidos", ctaLabel:"Quiero que me avisen", ctaUrl:"https://wa.me/5491154204111", position:2, published:true, schedules:[] },
  ];
  for (const row of rows) { const { schedules, ...data } = row; await prisma.publicExperience.create({ data: { ...data, updatedById:user.id, schedules:{create:schedules} } }); }
  revalidatePath("/gestion/programacion");
}
