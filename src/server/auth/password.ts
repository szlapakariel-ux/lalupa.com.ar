import bcrypt from "bcryptjs";

// bcryptjs (JS puro): sin binarios nativos, funciona igual en Windows y Railway.
// Cost 11 + rate limit de login es un equilibrio adecuado para un back-office.
const BCRYPT_COST = 11;

// Hash fijo para igualar el tiempo de respuesta cuando el usuario no existe
// (evita enumerar cuentas midiendo latencia).
const DUMMY_HASH = bcrypt.hashSync("contrasena-invalida-relleno", BCRYPT_COST);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  return bcrypt.compare(password, hash ?? DUMMY_HASH).then((ok) => ok && hash !== null);
}
