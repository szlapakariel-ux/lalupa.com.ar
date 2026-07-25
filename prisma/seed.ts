/**
 * Seed de DESARROLLO — datos ficticios, idempotente (se puede correr N veces).
 * En producción solo crea la administradora inicial si se setean
 * SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (y no existe ningún usuario).
 */
import { PrismaClient, type PackProduct, type Student } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(ymd(d));
};

async function main() {
  const isProduction = process.env.NODE_ENV === "production";

  // ── Primer usuario administrador ─────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@lalupa.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "lupa-admin-dev";

  if (isProduction && !process.env.SEED_ADMIN_EMAIL) {
    console.log("Producción sin SEED_ADMIN_EMAIL: no se crea nada.");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Administradora",
      passwordHash: await bcrypt.hash(adminPassword, 11),
      role: "ADMIN",
    },
  });
  console.log(`Admin lista: ${admin.email}`);

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  if (isProduction) {
    console.log("Producción: solo admin + configuración. Fin.");
    return;
  }

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

  const actividades = [
    { name: "Yoga", weekday: "LUNES", startTime: "18:30", durationMin: 60, capacity: 10 },
    { name: "Yoga", weekday: "MIERCOLES", startTime: "19:00", durationMin: 60, capacity: 10 },
    { name: "Taller de cerámica", weekday: "SABADO", startTime: "10:00", durationMin: 120, capacity: 8 },
    { name: "Entrenamiento", weekday: "VIERNES", startTime: "09:00", durationMin: 60, capacity: 6 },
  ] as const;

  const acts = [];
  for (const a of actividades) {
    const existing = await prisma.activity.findFirst({
      where: { name: a.name, weekday: a.weekday, startTime: a.startTime },
    });
    acts.push(
      existing ??
        (await prisma.activity.create({
          data: { ...a, teacherId: profe.id },
        })),
    );
  }

  const productos = [
    { name: "Clase suelta", classCount: 1, referencePrice: 12000, validityDays: 15 },
    { name: "Pack x4", classCount: 4, referencePrice: 40000, validityDays: 30 },
    { name: "Pack x8", classCount: 8, referencePrice: 72000, validityDays: 60 },
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

    // Asistencias de las últimas 2 semanas
    const yoga = acts[0];
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
          activityId: yoga.id,
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
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
