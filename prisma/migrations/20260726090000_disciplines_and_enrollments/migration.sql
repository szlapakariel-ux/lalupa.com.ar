-- Disciplinas, horarios e inscripciones (modelo aprobado).
--
-- Patrón expand -> backfill -> contract, 100% aditivo:
--  * NO se elimina ninguna tabla ni columna.
--  * NO se modifica Attendance, StudentPack, Payment, LedgerMovement,
--    User ni Session; no se insertan movimientos ni se recalculan saldos.
--  * Activity pasa a pertenecer a una Discipline (una por cada nombre
--    normalizado distinto). Activity.name queda como espejo legacy.
--  * PackProduct.disciplineId hereda la disciplina del activityId legacy
--    (null sigue significando "todas las disciplinas").
--  * Se crean inscripciones históricas desde asistencias y packs con
--    disciplina específica, sin duplicados.
--  * preferredActivityId solo se asigna cuando la disciplina tiene UN
--    único horario activo (inequívoco); en cualquier otro caso queda null.

-- 1) Discipline ---------------------------------------------------------------
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Discipline_normalizedName_key" ON "Discipline"("normalizedName");

-- 2) Activity.disciplineId (expand: nullable hasta el backfill) ---------------
ALTER TABLE "Activity" ADD COLUMN "disciplineId" TEXT;

-- 3) StudentDisciplineEnrollment ----------------------------------------------
CREATE TABLE "StudentDisciplineEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "preferredActivityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentDisciplineEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentDisciplineEnrollment_studentId_disciplineId_key"
    ON "StudentDisciplineEnrollment"("studentId", "disciplineId");
CREATE INDEX "StudentDisciplineEnrollment_disciplineId_active_idx"
    ON "StudentDisciplineEnrollment"("disciplineId", "active");
CREATE INDEX "StudentDisciplineEnrollment_preferredActivityId_idx"
    ON "StudentDisciplineEnrollment"("preferredActivityId");

-- 4) PackProduct.disciplineId (null = todas las disciplinas) -------------------
ALTER TABLE "PackProduct" ADD COLUMN "disciplineId" TEXT;

-- 5) Una Discipline por cada nombre normalizado distinto de Activity ----------
--    Normalización: trim + espacios colapsados + minúsculas. SIN fusiones
--    difusas: "Ceramica" y "Cerámica" quedan como disciplinas separadas.
INSERT INTO "Discipline" ("id", "name", "normalizedName", "active", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    min(trim(regexp_replace("name", '\s+', ' ', 'g'))),
    lower(trim(regexp_replace("name", '\s+', ' ', 'g'))),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Activity"
GROUP BY lower(trim(regexp_replace("name", '\s+', ' ', 'g')));

-- 6) Vincular cada Activity con su Discipline ----------------------------------
UPDATE "Activity" a
SET "disciplineId" = d."id"
FROM "Discipline" d
WHERE d."normalizedName" = lower(trim(regexp_replace(a."name", '\s+', ' ', 'g')));

-- 7) PackProduct: heredar la disciplina del horario legacy ---------------------
UPDATE "PackProduct" pp
SET "disciplineId" = a."disciplineId"
FROM "Activity" a
WHERE pp."activityId" IS NOT NULL
  AND a."id" = pp."activityId";

-- 8/9) Inscripciones históricas sin duplicados ---------------------------------
--     Fuentes: asistencias existentes y packs cuyo producto tiene disciplina.
INSERT INTO "StudentDisciplineEnrollment"
    ("id", "studentId", "disciplineId", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, src."studentId", src."disciplineId",
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT att."studentId", a."disciplineId"
    FROM "Attendance" att
    JOIN "Activity" a ON a."id" = att."activityId"
    UNION
    SELECT DISTINCT sp."studentId", pp."disciplineId"
    FROM "StudentPack" sp
    JOIN "PackProduct" pp ON pp."id" = sp."productId"
    WHERE pp."disciplineId" IS NOT NULL
) src
ON CONFLICT ("studentId", "disciplineId") DO NOTHING;

-- 10/11/12) Horario habitual SOLO cuando es inequívoco -------------------------
--     Único horario ACTIVO de la disciplina => se asigna; si hay varios o
--     ninguno, queda null. No se infiere nada por frecuencia ni suposiciones.
UPDATE "StudentDisciplineEnrollment" e
SET "preferredActivityId" = unico."activityId"
FROM (
    SELECT "disciplineId", min("id") AS "activityId"
    FROM "Activity"
    WHERE "active" = true
    GROUP BY "disciplineId"
    HAVING count(*) = 1
) unico
WHERE unico."disciplineId" = e."disciplineId";

-- Contract: tras el backfill, toda Activity tiene disciplina ------------------
ALTER TABLE "Activity" ALTER COLUMN "disciplineId" SET NOT NULL;

-- Claves foráneas e índices ----------------------------------------------------
ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_disciplineId_fkey"
    FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Activity_disciplineId_active_idx" ON "Activity"("disciplineId", "active");

ALTER TABLE "StudentDisciplineEnrollment"
    ADD CONSTRAINT "StudentDisciplineEnrollment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentDisciplineEnrollment"
    ADD CONSTRAINT "StudentDisciplineEnrollment_disciplineId_fkey"
    FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentDisciplineEnrollment"
    ADD CONSTRAINT "StudentDisciplineEnrollment_preferredActivityId_fkey"
    FOREIGN KEY ("preferredActivityId") REFERENCES "Activity"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PackProduct"
    ADD CONSTRAINT "PackProduct_disciplineId_fkey"
    FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
