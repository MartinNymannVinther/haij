import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-4">
      <main className="w-full max-w-sm">
        <p className="mb-6 text-center">
          <Link href="/" aria-label="Haij">
            <Wordmark className="text-2xl" />
          </Link>
        </p>
        {children}
      </main>
    </div>
  );
}
