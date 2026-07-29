import { prisma } from "@/server/db";
import type { Tx } from "./audit";
import { dateToYMD, todayYMD } from "@/lib/dates";
import type { PackForSelection } from "@/lib/policy";
import { isPackEligible, sumBalance } from "@/lib/policy";

/** Saldo de un pack = SUM(delta) de sus movimientos. */
export async function computeBalance(tx: Tx, studentPackId: string): Promise<number> {
  const agg = await tx.ledgerMovement.aggregate({
    where: { studentPackId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

export interface PackWithBalance extends PackForSelection {
  productName: string;
  classCount: number;
}

/**
 * Packs de una alumna con su saldo derivado del libro de movimientos.
 * Bloquea las filas de packs (FOR UPDATE) cuando se usa dentro de una
 * transacción de débito, para serializar débitos concurrentes.
 */
export async function packsWithBalances(
  tx: Tx,
  studentId: string,
  opts: { lock?: boolean } = {},
): Promise<PackWithBalance[]> {
  if (opts.lock) {
    await tx.$queryRaw`SELECT id FROM "StudentPack" WHERE "studentId" = ${studentId} FOR UPDATE`;
  }
  const packs = await tx.studentPack.findMany({
    where: { studentId },
    include: {
      product: { select: { name: true, disciplineId: true } },
      ledger: { select: { delta: true } },
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  return packs.map((p) => ({
    id: p.id,
    status: p.status,
    expiresAtYMD: dateToYMD(p.expiresAt),
    startDateYMD: dateToYMD(p.startDate),
    createdAt: p.createdAt,
    productDisciplineId: p.product.disciplineId,
    balance: sumBalance(p.ledger),
    productName: p.product.name,
    classCount: p.classCount,
  }));
}

/**
 * Clases disponibles de una alumna para una disciplina y fecha dadas
 * (solo packs elegibles: activos, vigentes y compatibles con la
 * disciplina — genéricos incluidos). Con disciplineId null suma todos los
 * packs vigentes con saldo.
 */
export function availableBalance(
  packs: PackWithBalance[],
  disciplineId: string | null,
  dateYMD: string = todayYMD(),
): number {
  return packs
    .filter((p) =>
      disciplineId
        ? isPackEligible(p, disciplineId, dateYMD)
        : p.status === "ACTIVO" && p.expiresAtYMD >= dateYMD && p.balance > 0,
    )
    .reduce((acc, p) => acc + p.balance, 0);
}

/** Historial de movimientos de una alumna, más reciente primero. */
export async function studentLedger(studentId: string) {
  return prisma.ledgerMovement.findMany({
    where: { studentId },
    include: {
      studentPack: { include: { product: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
