import { buttonVariants } from "@rallly/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@rallly/ui/breadcrumb";
import { BarChart2Icon, HomeIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ErrorPage, ErrorPageLinkItem } from "@/components/error-page";
import { Link } from "@/components/link";
import { BrandStyle } from "@/features/branding/components/brand-style";
import { DefaultLogo } from "@/features/branding/components/default-logo";
import { loadConferencingOptions } from "@/features/conferencing/loaders";
import { loadInstancePolicy } from "@/features/instance-policy/loaders";
import { loadCanCreatePolls } from "@/features/oidc-groups/loaders";
import { CreatePoll } from "@/features/poll/components/create-poll";
import { getActiveSpaceForUser } from "@/features/space/data";
import { isSpaceBrandingActive } from "@/features/space/utils";
import { Trans } from "@/i18n/client";
import { getTranslation } from "@/i18n/server";
import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();
  const user = session?.user && !session.user.isGuest ? session.user : null;
  const userId = user?.id ?? null;

  // OIDC_POLL_CREATOR_GROUPS: explain instead of showing a form whose submit
  // the server would refuse anyway.
  if (!(await loadCanCreatePolls())) {
    const { t } = await getTranslation();
    return (
      <ErrorPage
        logo={<DefaultLogo />}
        label="403"
        title={t("pollCreationForbiddenTitle", {
          defaultValue: "You can't create polls",
        })}
        description={t("pollCreationForbiddenDescription", {
          defaultValue:
            "Poll creation is reserved for specific groups on this instance. You can still respond to polls you are invited to. Ask an administrator if you need access.",
        })}
        actions={
          <Link
            href="/"
            className={buttonVariants({ size: "lg", variant: "primary" })}
          >
            {t("errorBackToHome", { defaultValue: "Back to home" })}
          </Link>
        }
      >
        <ErrorPageLinkItem
          href="/"
          icon={<HomeIcon className="size-4 text-muted-foreground" />}
          title={t("errorLinkHome", { defaultValue: "Home" })}
          description={t("errorLinkHomeDescription", {
            defaultValue: "Go back to your dashboard.",
          })}
        />
      </ErrorPage>
    );
  }

  const space = userId ? await getActiveSpaceForUser(userId) : null;

  if (userId && !space) {
    redirect("/setup");
  }

  const conferencing = await loadConferencingOptions({
    userId,
    email: user?.email ?? null,
  });

  const primaryColor =
    space?.primaryColor &&
    isSpaceBrandingActive({
      ...space,
      spaceBrandingAllowed: (await loadInstancePolicy()).spaceBrandingAllowed,
    })
      ? space.primaryColor
      : null;

  return (
    <div className="page-bg-gray-100 absolute inset-0 h-dvh scroll-pt-16 overflow-auto dark:bg-gray-900">
      {primaryColor ? <BrandStyle primaryColor={primaryColor} /> : null}
      <CreatePoll
        conferencing={conferencing}
        nav={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href="/polls" />}
                  className="flex items-center gap-x-2"
                >
                  <BarChart2Icon className="size-4" />
                  <Trans i18nKey="polls" defaults="Polls" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  <Trans i18nKey="newPoll" defaults="New poll" />
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
    </div>
  );
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { t } = await getTranslation(params.locale);
  return {
    title: t("newPoll"),
  };
}
