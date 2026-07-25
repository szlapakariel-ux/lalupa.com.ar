import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl text-tinta">Espacio La Lupa</p>
          <p className="mt-1 text-sm text-tinta-suave">Gestión interna</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
