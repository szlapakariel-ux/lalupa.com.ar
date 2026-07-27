/**
 * Backfill de la migración 20260726090000_disciplines_and_enrollments sobre
 * una base con datos LEGACY reales (esquema previo, sin disciplinas),
 * reproduciendo lo observado en staging:
 *  - "Ceramica · Martes 10:30";
 *  - tres Activity "Ilustración y collage" (miércoles 18:30, viernes 18:30,
 *    sábado 14:00);
 *  - packs específicos por horario y packs genéricos;
 *  - asistencias históricas y movimientos de ledger.
 *
 * Verifica: disciplinas por nombre normalizado, vínculos, productos,
 * inscripciones sin duplicar, horario habitual solo cuando es inequívoco, y
 * que las cantidades financieras/de ledger quedan EXACTAMENTE iguales.
 * (La migración sobre base VACÍA la valida el global setup en cada corrida.)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { isPackEligible } from "@/lib/policy";
import { todayYMD } from "@/lib/dates";

const DB = "lalupa_disc_mig";
const URL = `postgresql://postgres:postgres@localhost:5434/${DB}`;
const MIGRATIONS = path.resolve("prisma/migrations");

function applyMigration(folder: string) {
  execFileSync(
    process.execPath,
    [
      path.resolve("node_modules/prisma/build/index.js"),
      "db",
      "execute",
      "--file",
      path.join(MIGRATIONS, folder, "migration.sql"),
      "--url",
      URL,
    ],
    { stdio: "pipe" },
  );
}

let inc: PrismaClient | null = null;

afterAll(async () => {
  await inc?.$disconnect();
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
});

describe("backfill de disciplinas sobre datos legacy", () => {
  it("migra el escenario de staging conservando datos, saldos e historial", async () => {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
    applyMigration("20260725152742_init");
    applyMigration("20260725180000_ledger_immutability");

    inc = new PrismaClient({ datasourceUrl: URL });
    const run = (sql: string) => inc!.$executeRawUnsafe(sql);

    // ── Datos legacy (esquema previo: Activity sin disciplina) ─────────────
    await run(`INSERT INTO "User" ("id","email","name","passwordHash","role","updatedAt")
               VALUES ('u1','a@l.local','Admin','x','ADMIN',CURRENT_TIMESTAMP)`);
    await run(`INSERT INTO "Activity" ("id","name","weekday","startTime","durationMin","updatedAt")
               VALUES
               ('act-cer','Ceramica','MARTES','10:30',120,CURRENT_TIMESTAMP),
               ('act-il-mi','Ilustración y collage','MIERCOLES','18:30',120,CURRENT_TIMESTAMP),
               ('act-il-vi','Ilustración y collage','VIERNES','18:30',120,CURRENT_TIMESTAMP),
               ('act-il-sa','Ilustración y collage','SABADO','14:00',120,CURRENT_TIMESTAMP)`);
    await run(`INSERT INTO "PackProduct" ("id","name","classCount","referencePrice","validityDays","activityId","updatedAt")
               VALUES
               ('prod-gen','Pack x8 general',8,72000,60,NULL,CURRENT_TIMESTAMP),
               ('prod-il','Pack x4 Ilustración',4,40000,30,'act-il-vi',CURRENT_TIMESTAMP),
               ('prod-cer','Pack x4 Ceramica',4,48000,30,'act-cer',CURRENT_TIMESTAMP)`);
    await run(`INSERT INTO "Student" ("id","firstName","lastName","updatedAt")
               VALUES
               ('s1','Alumna','Uno',CURRENT_TIMESTAMP),
               ('s2','Alumna','Dos',CURRENT_TIMESTAMP),
               ('s3','Alumna','Tres',CURRENT_TIMESTAMP)`);
    // s1: pack de ilustración (comprado en el horario del viernes) + asistencia
    // s2: pack de cerámica, sin asistencias
    // s3: pack genérico + asistencia en ilustración miércoles
    await run(`INSERT INTO "StudentPack" ("id","studentId","productId","classCount","agreedPrice","startDate","expiresAt","createdById","updatedAt")
               VALUES
               ('sp1','s1','prod-il',4,40000,CURRENT_DATE - 7,CURRENT_DATE + 23,'u1',CURRENT_TIMESTAMP),
               ('sp2','s2','prod-cer',4,48000,CURRENT_DATE - 7,CURRENT_DATE + 23,'u1',CURRENT_TIMESTAMP),
               ('sp3','s3','prod-gen',8,72000,CURRENT_DATE - 7,CURRENT_DATE + 53,'u1',CURRENT_TIMESTAMP)`);
    await run(`INSERT INTO "Attendance" ("id","date","activityId","studentId","status","registeredById")
               VALUES
               ('att1',CURRENT_DATE - 7,'act-il-vi','s1','PRESENTE','u1'),
               ('att2',CURRENT_DATE - 5,'act-il-mi','s3','PRESENTE','u1')`);
    await run(`INSERT INTO "LedgerMovement" ("id","studentId","studentPackId","type","delta","createdById")
               VALUES
               ('lm1','s1','sp1','PACK_PURCHASE',4,'u1'),
               ('lm2','s2','sp2','PACK_PURCHASE',4,'u1'),
               ('lm3','s3','sp3','PACK_PURCHASE',8,'u1'),
               ('lm4','s1','sp1','CLASS_USED',-1,'u1'),
               ('lm5','s3','sp3','CLASS_USED',-1,'u1')`);

    // ── Cantidades ANTES ────────────────────────────────────────────────────
    const countsBefore = {
      students: await inc.student.count(),
      activities: await inc.activity.count(),
      products: await inc.packProduct.count(),
      packs: await inc.studentPack.count(),
      attendances: await inc.attendance.count(),
      ledger: await inc.ledgerMovement.count(),
      ledgerSum: (await inc.ledgerMovement.aggregate({ _sum: { delta: true } }))._sum
        .delta,
    };

    // ── Migración nueva sobre la base con datos ─────────────────────────────
    applyMigration("20260726090000_disciplines_and_enrollments");

    // ── Disciplinas: una por nombre normalizado ─────────────────────────────
    const disciplines = await inc.discipline.findMany({ orderBy: { name: "asc" } });
    expect(disciplines.map((d) => d.normalizedName).sort()).toEqual([
      "ceramica",
      "ilustración y collage",
    ]);
    const ceramica = disciplines.find((d) => d.normalizedName === "ceramica")!;
    const ilustracion = disciplines.find(
      (d) => d.normalizedName === "ilustración y collage",
    )!;

    // Las tres "Ilustración y collage" comparten UNA disciplina y conservan
    // sus horarios exactos.
    const acts = await inc.activity.findMany({ orderBy: { id: "asc" } });
    const ilustracionActs = acts.filter((a) => a.disciplineId === ilustracion.id);
    expect(ilustracionActs).toHaveLength(3);
    expect(
      ilustracionActs.map((a) => `${a.weekday} ${a.startTime}`).sort(),
    ).toEqual(["MIERCOLES 18:30", "SABADO 14:00", "VIERNES 18:30"].sort());
    expect(acts.find((a) => a.id === "act-cer")?.disciplineId).toBe(ceramica.id);

    // ── Productos: heredan la disciplina del horario legacy ────────────────
    const prods = await inc.packProduct.findMany();
    expect(prods.find((p) => p.id === "prod-il")?.disciplineId).toBe(ilustracion.id);
    expect(prods.find((p) => p.id === "prod-cer")?.disciplineId).toBe(ceramica.id);
    expect(prods.find((p) => p.id === "prod-gen")?.disciplineId).toBeNull();
    // activityId legacy intacto; precios intactos.
    expect(prods.find((p) => p.id === "prod-il")?.activityId).toBe("act-il-vi");
    expect(Number(prods.find((p) => p.id === "prod-cer")?.referencePrice)).toBe(48000);

    // ── Inscripciones históricas sin duplicados ─────────────────────────────
    const enrollments = await inc.studentDisciplineEnrollment.findMany();
    const key = (e: (typeof enrollments)[number]) => `${e.studentId}:${e.disciplineId}`;
    expect(new Set(enrollments.map(key)).size).toBe(enrollments.length);
    expect(enrollments.map(key).sort()).toEqual(
      [
        `s1:${ilustracion.id}`, // asistencia + pack específico → UNA sola
        `s2:${ceramica.id}`, // pack específico sin asistencias
        `s3:${ilustracion.id}`, // asistencia (pack genérico no inscribe)
      ].sort(),
    );

    // Horario habitual: cerámica tiene UN único horario activo → asignado;
    // ilustración tiene tres → queda pendiente (null), sin inferencias.
    const es2 = enrollments.find((e) => e.studentId === "s2")!;
    expect(es2.preferredActivityId).toBe("act-cer");
    for (const e of enrollments.filter((x) => x.disciplineId === ilustracion.id)) {
      expect(e.preferredActivityId).toBeNull();
    }

    // ── Nada se alteró: cantidades y saldos idénticos ───────────────────────
    const countsAfter = {
      students: await inc.student.count(),
      activities: await inc.activity.count(),
      products: await inc.packProduct.count(),
      packs: await inc.studentPack.count(),
      attendances: await inc.attendance.count(),
      ledger: await inc.ledgerMovement.count(),
      ledgerSum: (await inc.ledgerMovement.aggregate({ _sum: { delta: true } }))._sum
        .delta,
    };
    expect(countsAfter).toEqual(countsBefore);

    // ── El pack de ilustración sirve para CUALQUIERA de los tres horarios ──
    const sp1 = await inc.studentPack.findUniqueOrThrow({
      where: { id: "sp1" },
      include: { product: true, ledger: true },
    });
    const packSel = {
      id: sp1.id,
      status: sp1.status,
      expiresAtYMD: sp1.expiresAt.toISOString().slice(0, 10),
      startDateYMD: sp1.startDate.toISOString().slice(0, 10),
      createdAt: sp1.createdAt,
      productDisciplineId: sp1.product.disciplineId,
      balance: sp1.ledger.reduce((a, m) => a + m.delta, 0),
    } as const;
    for (const a of ilustracionActs) {
      expect(isPackEligible(packSel, a.disciplineId, todayYMD())).toBe(true);
    }
    // Y NO sirve para cerámica.
    expect(isPackEligible(packSel, ceramica.id, todayYMD())).toBe(false);
  }, 120_000);
});
