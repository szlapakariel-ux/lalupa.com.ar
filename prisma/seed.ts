/**
 * Seed con dos modos EXCLUYENTES según NODE_ENV:
 *
 *  - PRODUCCIÓN: solo el bootstrap de la primera administradora
 *    (ver prisma/seed-admin.ts). Exige SEED_ADMIN_EMAIL y
 *    SEED_ADMIN_PASSWORD juntas, valida la contraseña, nunca crea usuarios
 *    si ya existe alguno y nunca usa credenciales de desarrollo.
 *
 *  - DESARROLLO: datos ficticios idempotentes (se puede correr N veces) con
 *    credenciales documentadas SOLO para uso local
 *    (admin@lalupa.local / lupa-admin-dev). Estas credenciales jamás se
 *    aplican en producción.
 */
import { PrismaClient, type Activity, type PackProduct, type Student } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SeedConfigError, seedProductionAdmin } from "./seed-admin";

const prisma = new PrismaClient();

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(ymd(d));
};

async function main() {
  if (process.env.NODE_ENV === "production") {
    // Producción: SOLO el bootstrap seguro de la primera administradora.
    // Nunca datos ficticios ni credenciales de desarrollo.
    await seedProductionAdmin(prisma, {
      SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
      SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    });
    return;
  }

  // ── Usuarios de DESARROLLO (credenciales ficticias, solo uso local) ──────
  const admin = await prisma.user.upsert({
    where: { email: "admin@lalupa.local" },
    update: {},
    create: {
      email: "admin@lalupa.local",
      name: "Administradora",
      passwordHash: await bcrypt.hash("lupa-admin-dev", 11),
      role: "ADMIN",
    },
  });
  console.log(`Admin de desarrollo lista: ${admin.email}`);

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // ── Datos ficticios de desarrollo ────────────────────────────────────────
  const profe = await prisma.user.upsert({
    where: { email: "profe@lalupa.local" },
    update: {},
    create: {
      email: "profe@lalupa.local",
      name: "Profesora Ejemplo",
      passwordHash: await bcrypt.hash("lupa-profe-dev", 11),
      role: "TEACHER",
    },
  });

  // Disciplinas con sus horarios. Yoga tiene un horario TODOS los días para
  // que las pruebas manuales y E2E siempre encuentren una clase "hoy".
  const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const WEEKDAYS = [
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
    "DOMINGO",
  ] as const;
  const disciplinas = [
    {
      name: "Yoga",
      horarios: WEEKDAYS.map((weekday) => ({
        weekday,
        startTime: "18:30",
        durationMin: 60,
        capacity: 10,
      })),
    },
    {
      name: "Taller de cerámica",
      horarios: [
        { weekday: "SABADO", startTime: "10:00", durationMin: 120, capacity: 8 },
      ],
    },
    {
      name: "Entrenamiento",
      horarios: [
        { weekday: "VIERNES", startTime: "09:00", durationMin: 60, capacity: 6 },
      ],
    },
  ] as const;

  const discByName: Record<string, { id: string; name: string }> = {};
  const acts: Activity[] = [];
  for (const d of disciplinas) {
    const discipline = await prisma.discipline.upsert({
      where: { normalizedName: normalizar(d.name) },
      update: {},
      create: { name: d.name, normalizedName: normalizar(d.name) },
    });
    discByName[d.name] = discipline;
    for (const h of d.horarios) {
      const existing = await prisma.activity.findFirst({
        where: { disciplineId: discipline.id, weekday: h.weekday, startTime: h.startTime },
      });
      acts.push(
        existing ??
          (await prisma.activity.create({
            data: {
              ...h,
              name: discipline.name,
              disciplineId: discipline.id,
              teacherId: profe.id,
            },
          })),
      );
    }
  }
  const yoga = discByName["Yoga"];

  const productos = [
    { name: "Clase suelta", classCount: 1, referencePrice: 12000, validityDays: 15 },
    { name: "Pack x4", classCount: 4, referencePrice: 40000, validityDays: 30 },
    { name: "Pack x8", classCount: 8, referencePrice: 72000, validityDays: 60 },
    {
      name: "Pack x4 Cerámica",
      classCount: 4,
      referencePrice: 48000,
      validityDays: 30,
      disciplineId: discByName["Taller de cerámica"].id,
    },
  ];
  const prods: PackProduct[] = [];
  for (const p of productos) {
    const existing = await prisma.packProduct.findFirst({ where: { name: p.name } });
    prods.push(existing ?? (await prisma.packProduct.create({ data: p })));
  }

  // Alumnas ficticias
  const alumnas: Array<{
    firstName: string;
    lastName: string;
    status?: "ACTIVA" | "PAUSADA" | "INACTIVA";
    phone?: string;
  }> = [
    { firstName: "María", lastName: "González", phone: "11-5555-0001" },
    { firstName: "Lucía", lastName: "Pérez", phone: "11-5555-0002" },
    { firstName: "Carla", lastName: "Rodríguez", phone: "11-5555-0003" },
    { firstName: "Sofía", lastName: "Fernández", phone: "11-5555-0004" },
    { firstName: "Valentina", lastName: "López", phone: "11-5555-0005" },
    { firstName: "Julieta", lastName: "Martínez", phone: "11-5555-0006" },
    { firstName: "Camila", lastName: "Sánchez", phone: "11-5555-0007", status: "PAUSADA" },
    { firstName: "Florencia", lastName: "Romero", phone: "11-5555-0008", status: "INACTIVA" },
    { firstName: "Agustina", lastName: "Díaz", phone: "11-5555-0009" },
    { firstName: "Paula", lastName: "Torres", phone: "11-5555-0010" },
    { firstName: "Micaela", lastName: "Ruiz", phone: "11-5555-0011" },
    { firstName: "Bianca", lastName: "Molina", phone: "11-5555-0012" },
  ];

  const students: Student[] = [];
  for (const a of alumnas) {
    const existing = await prisma.student.findFirst({
      where: { firstName: a.firstName, lastName: a.lastName },
    });
    students.push(existing ?? (await prisma.student.create({ data: a })));
  }

  // Inscripciones de ejemplo (idempotentes): todas en Yoga; dos también en
  // cerámica. Los horarios habituales quedan mayormente pendientes; María
  // tiene el lunes 18:30 como habitual para mostrar el caso completo.
  const yogaLunes = acts.find(
    (a) => a.disciplineId === yoga.id && a.weekday === "LUNES",
  );
  for (const s of students) {
    await prisma.studentDisciplineEnrollment.upsert({
      where: {
        studentId_disciplineId: { studentId: s.id, disciplineId: yoga.id },
      },
      update: {},
      create: {
        studentId: s.id,
        disciplineId: yoga.id,
        preferredActivityId: s.id === students[0].id ? (yogaLunes?.id ?? null) : null,
      },
    });
  }
  for (const s of [students[2], students[3]]) {
    await prisma.studentDisciplineEnrollment.upsert({
      where: {
        studentId_disciplineId: {
          studentId: s.id,
          disciplineId: discByName["Taller de cerámica"].id,
        },
      },
      update: {},
      create: {
        studentId: s.id,
        disciplineId: discByName["Taller de cerámica"].id,
      },
    });
  }

  // Alertas de ejemplo (una visible para todas, una solo admin)
  if ((await prisma.studentAlert.count()) === 0) {
    await prisma.studentAlert.create({
      data: {
        studentId: students[0].id,
        type: "LESION",
        title: "Molestia lumbar",
        instruction: "Evitar flexiones profundas; ofrecer variantes suaves.",
        visibility: "TODOS",
        createdById: admin.id,
      },
    });
    await prisma.studentAlert.create({
      data: {
        studentId: students[1].id,
        type: "ALERGIA",
        title: "Alergia al maní",
        instruction: "No ofrecer snacks con frutos secos.",
        visibility: "SOLO_ADMIN",
        createdById: admin.id,
      },
    });
  }

  // Packs de ejemplo en distintos estados (solo si no hay packs aún)
  if ((await prisma.studentPack.count()) === 0) {
    const mkPack = async (
      studentIdx: number,
      prodIdx: number,
      startOffsetDays: number,
      opts: { payStatus?: "PAGADO" | "PENDIENTE" | "PARCIAL" | "BONIFICADO" } = {},
    ) => {
      const product = prods[prodIdx];
      const start = daysFromNow(startOffsetDays);
      const expires = daysFromNow(startOffsetDays + product.validityDays);
      const pack = await prisma.studentPack.create({
        data: {
          studentId: students[studentIdx].id,
          productId: product.id,
          classCount: product.classCount,
          agreedPrice: product.referencePrice,
          startDate: start,
          expiresAt: expires,
          createdById: admin.id,
        },
      });
      const payment = opts.payStatus
        ? await prisma.payment.create({
            data: {
              studentId: students[studentIdx].id,
              studentPackId: pack.id,
              concept: product.name,
              amount: product.referencePrice,
              date: start,
              method: "TRANSFERENCIA",
              status: opts.payStatus,
              createdById: admin.id,
            },
          })
        : null;
      await prisma.ledgerMovement.create({
        data: {
          studentId: students[studentIdx].id,
          studentPackId: pack.id,
          type: "PACK_PURCHASE",
          delta: product.classCount,
          paymentId: payment?.id,
          note: product.name,
          createdById: admin.id,
        },
      });
      return pack;
    };

    // Vigentes
    await mkPack(0, 1, -10, { payStatus: "PAGADO" });   // María, Pack x4
    await mkPack(1, 2, -20, { payStatus: "PARCIAL" });  // Lucía, Pack x8
    await mkPack(2, 1, -5, { payStatus: "PENDIENTE" }); // Carla, Pack x4 sin pagar
    await mkPack(3, 1, -27, { payStatus: "PAGADO" });   // Sofía, por vencer en 3 días
    // Vencido con saldo (para probar expirePacks)
    await mkPack(4, 1, -45, { payStatus: "PAGADO" });   // Valentina
    // Bonificado
    await mkPack(5, 0, -2, { payStatus: "BONIFICADO" }); // Julieta, clase suelta

    // Asistencias de las últimas 2 semanas, siempre en el horario de Yoga
    // cuyo día coincide con la fecha (coherente con la validación real).
    const WEEKDAY_BY_INDEX = [
      "DOMINGO",
      "LUNES",
      "MARTES",
      "MIERCOLES",
      "JUEVES",
      "VIERNES",
      "SABADO",
    ] as const;
    const yogaDelDia = (date: Date) =>
      acts.find(
        (a) =>
          a.disciplineId === yoga.id &&
          a.weekday === WEEKDAY_BY_INDEX[date.getUTCDay()],
      )!;
    const marcar = async (
      studentIdx: number,
      offsetDays: number,
      status: "PRESENTE" | "AUSENTE" | "CANCELO_A_TIEMPO" | "CANCELO_TARDE" | "CLASE_PRUEBA",
      consume: boolean,
    ) => {
      const date = daysFromNow(offsetDays);
      const att = await prisma.attendance.create({
        data: {
          date,
          activityId: yogaDelDia(date).id,
          studentId: students[studentIdx].id,
          status,
          registeredById: profe.id,
        },
      });
      if (consume) {
        const pack = await prisma.studentPack.findFirst({
          where: { studentId: students[studentIdx].id },
        });
        if (pack) {
          await prisma.ledgerMovement.create({
            data: {
              studentId: students[studentIdx].id,
              studentPackId: pack.id,
              type: "CLASS_USED",
              delta: -1,
              attendanceId: att.id,
              note: `Yoga ${ymd(date)}`,
              createdById: profe.id,
            },
          });
        }
      }
      return att;
    };

    await marcar(0, -7, "PRESENTE", true);
    await marcar(0, -14, "PRESENTE", true);
    await marcar(1, -7, "CANCELO_TARDE", true);
    await marcar(1, -14, "CANCELO_A_TIEMPO", false);
    await marcar(2, -7, "AUSENTE", true);
    await marcar(9, -7, "CLASE_PRUEBA", false);

    // Una asistencia revertida (trazable: débito + reversal)
    const att = await marcar(0, -3, "PRESENTE", true);
    const debit = await prisma.ledgerMovement.findFirst({
      where: { attendanceId: att.id, type: "CLASS_USED" },
    });
    if (debit) {
      await prisma.attendance.update({
        where: { id: att.id },
        data: { revertedAt: new Date(), revertedById: admin.id },
      });
      await prisma.ledgerMovement.create({
        data: {
          studentId: debit.studentId,
          studentPackId: debit.studentPackId,
          type: "REVERSAL",
          delta: 1,
          attendanceId: att.id,
          reversalOfId: debit.id,
          note: "Marcada por error (seed)",
          createdById: admin.id,
        },
      });
    }
  }

  console.log("Seed de desarrollo completo.");
}

main()
  .catch((e) => {
    // Los errores de configuración traen un mensaje seguro (sin contraseñas);
    // se imprime solo ese mensaje, sin stack ni variables de entorno.
    if (e instanceof SeedConfigError) {
      console.error(`Seed abortado: ${e.message}`);
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
