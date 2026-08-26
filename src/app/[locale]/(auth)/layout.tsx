export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center p-4">
      <main className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-semibold tracking-tight">Haij</p>
        {children}
      </main>
    </div>
  );
}
