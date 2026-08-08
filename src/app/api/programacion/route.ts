import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const rows = await prisma.publicExperience.findMany({ where:{published:true}, orderBy:[{position:"asc"},{createdAt:"asc"}], include:{schedules:{orderBy:{position:"asc"}},images:{select:{id:true,alt:true,isCover:true,position:true},orderBy:{position:"asc"}}} });
  return NextResponse.json(rows.map(x=>({id:x.id,category:x.category,title:x.title,guides:x.guides,description:x.description,status:x.status,details:x.details,ctaLabel:x.ctaLabel,ctaUrl:x.ctaUrl,position:x.position,schedules:x.schedules,images:x.images.map(i=>({...i,url:`/api/programacion/imagenes/${i.id}`}))})),{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}});
}
