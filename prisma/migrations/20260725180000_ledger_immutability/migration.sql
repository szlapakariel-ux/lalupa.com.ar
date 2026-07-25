-- Inmutabilidad FÍSICA del libro de movimientos (auditoría P1-02).
--
-- Hasta ahora la regla "LedgerMovement solo se inserta" era una convención
-- del código. Este trigger la hace cumplir en PostgreSQL: cualquier UPDATE
-- o DELETE sobre la tabla falla, venga de la aplicación, de Prisma Studio o
-- de SQL directo con la conexión de la aplicación. INSERT sigue permitido,
-- por lo que todos los flujos compensatorios (compra, consumo, corrección,
-- cancelación, expiración y reversión) siguen funcionando sin cambios.
--
-- Alcance documentado: protege contra mutaciones por la conexión normal de
-- la aplicación. Un superusuario/administrador total de PostgreSQL siempre
-- puede alterar la infraestructura (deshabilitar el trigger, TRUNCATE, DDL);
-- eso se mitiga con permisos de infraestructura y backups, no desde acá.

CREATE OR REPLACE FUNCTION lalupa_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'LedgerMovement es inmutable: % no permitido (id=%). Registrá un movimiento compensatorio nuevo (CORRECTION_POS/CORRECTION_NEG, REVERSAL o CANCELLATION).',
    TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS ledger_movement_immutable ON "LedgerMovement";

CREATE TRIGGER ledger_movement_immutable
  BEFORE UPDATE OR DELETE ON "LedgerMovement"
  FOR EACH ROW
  EXECUTE FUNCTION lalupa_ledger_immutable();
