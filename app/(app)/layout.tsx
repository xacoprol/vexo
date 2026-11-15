import { Suspense, type ReactNode } from "react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { signOut } from "@/lib/auth";
import { countUnreadWhatsapp } from "@/lib/whatsapp-inbox";

export const dynamic = "force-dynamic";

function SignOutForm({
  className,
  children,
  label = "Cerrar sesión",
}: {
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className={className ?? "btn-ghost text-xs"}
        aria-label={label}
        title={label}
      >
        {children ?? label}
      </button>
    </form>
  );
}

function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-6 w-6"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  let companyName = "";
  try {
    const settings = await prisma.companySettings.findFirst();
    companyName =
      settings?.companyName?.trim() || settings?.name?.trim() || "";
  } catch {
    companyName = "";
  }

  let whatsappUnread = 0;
  try {
    whatsappUnread = await countUnreadWhatsapp();
  } catch {
    whatsappUnread = 0;
  }

  const userLabel =
    session.user?.name?.trim() || session.user?.email?.trim() || null;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <Sidebar
        companyName={companyName}
        whatsappUnread={whatsappUnread}
        signOutSlot={
          <SignOutForm className="btn-ghost inline-flex h-11 w-11 cursor-pointer items-center justify-center p-0">
            <SignOutIcon />
          </SignOutForm>
        }
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-transparent">
        <AppTopBar
          userLabel={userLabel}
          signOutSlot={<SignOutForm className="btn-ghost px-2 py-1.5 text-xs" />}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
