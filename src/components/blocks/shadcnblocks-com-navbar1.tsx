"use client";

import * as React from "react";
import type { JSX } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * shadcnblocks.com — Navbar1.
 *
 * Structurally the upstream block: a desktop row with Radix dropdown panels,
 * a mobile sheet whose grouped entries collapse into an accordion, and an
 * auth pair on the right. Four things differ, each because the upstream
 * snippet is written for a plain-React demo page rather than a Next.js app:
 *
 * 1. Internal links route through next/link (see `NavAnchor`). Upstream uses
 *    bare <a>, which in Next means every nav click is a full document reload
 *    — losing client-side routing, the session already in memory, and the
 *    page-enter transition this app runs on every route.
 * 2. Dropdown entries are `<NavigationMenuLink asChild>` per item. Upstream
 *    wraps the whole <ul> in one NavigationMenuLink, which renders an <a>
 *    around every <li> *and* around each item's own <a> — nested anchors,
 *    which is invalid HTML and collapses the panel into a single link target
 *    for keyboard and screen-reader users.
 * 3. Mobile links are wrapped in SheetClose. With client-side routing the
 *    sheet does not unmount on navigation, so upstream's version leaves the
 *    menu covering the page you just navigated to.
 * 4. The pill-level trigger and links are `bg-transparent`, not
 *    `bg-background`. This navbar floats on a translucent capsule over a
 *    photo backdrop; an opaque ground behind each link would read as a row
 *    of grey rectangles sitting on the glass.
 *
 * Demo defaults (shadcnblocks.com logo, Products/Careers/Status/Imprint) are
 * not carried over — logo, menu and auth are required props. Shipping
 * placeholder routes on a live marketing site is the exact thing SiteFooter
 * already calls out; see its header comment.
 *
 * 5. `extraAction` (optional) is a single external icon link, added for the
 *    Discord invite. It sits beside the auth pair rather than inside `menu`
 *    because it isn't an in-app route or a dropdown, just one outbound link
 *    the whole site surfaces the same way everywhere.
 */

interface MenuItem {
  title: string;
  url: string;
  description?: string;
  icon?: JSX.Element;
  items?: MenuItem[];
}

interface Navbar1Props {
  logo: {
    url: string;
    src: string;
    alt: string;
    title: string;
  };
  menu: MenuItem[];
  mobileExtraLinks?: {
    name: string;
    url: string;
  }[];
  auth: {
    login: {
      text: string;
      url: string;
    };
    signup: {
      text: string;
      url: string;
    };
  };
  /** A single external icon link (e.g. Discord), rendered beside the auth pair. */
  extraAction?: {
    href: string;
    label: string;
    icon: JSX.Element;
  };
  /** Applied to the outer <section>, so a host layout can own the chrome. */
  className?: string;
}

/**
 * Routes in-app paths through next/link and leaves anything else (absolute
 * URLs, `#` anchors, mailto:) on a plain anchor — passing those to next/link
 * would either warn or swallow the navigation.
 *
 * forwardRef is not optional here. Every place this is handed to an `asChild`
 * prop — Button, SheetClose, NavigationMenuLink — Radix's Slot clones it and
 * attaches a ref to reach the real DOM node. A plain function component drops
 * that ref, and NavigationMenu's collection then never registers its items,
 * which leaves the desktop dropdown unable to open at all.
 */
const NavAnchor = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & { href: string }
>(({ href, className, children, ...props }, ref) => {
  if (href.startsWith("/")) {
    return (
      <Link href={href} ref={ref} className={className} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} ref={ref} className={className} {...props}>
      {children}
    </a>
  );
});
NavAnchor.displayName = "NavAnchor";

const Navbar1 = ({
  logo,
  menu,
  mobileExtraLinks = [],
  auth,
  extraAction,
  className,
}: Navbar1Props) => {
  return (
    <section className={cn("py-4", className)}>
      <div className="container">
        <nav className="hidden justify-between lg:flex">
          <div className="flex items-center gap-6">
            <NavAnchor href={logo.url} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- the block
                  takes an arbitrary logo URL, including remote ones, which
                  next/image would reject without a remotePatterns entry. */}
              <img src={logo.src} className="w-8" alt={logo.alt} />
              <span className="text-lg font-semibold">{logo.title}</span>
            </NavAnchor>
            <div className="flex items-center">
              <NavigationMenu>
                <NavigationMenuList>
                  {menu.map((item) => renderMenuItem(item))}
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {extraAction && (
              <Button asChild variant="outline" size="icon">
                <NavAnchor href={extraAction.href} target="_blank" rel="noopener noreferrer" aria-label={extraAction.label}>
                  {extraAction.icon}
                </NavAnchor>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <NavAnchor href={auth.login.url}>{auth.login.text}</NavAnchor>
            </Button>
            <Button asChild size="sm">
              <NavAnchor href={auth.signup.url}>{auth.signup.text}</NavAnchor>
            </Button>
          </div>
        </nav>
        <div className="block lg:hidden">
          <div className="flex items-center justify-between">
            <NavAnchor href={logo.url} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img src={logo.src} className="w-8" alt={logo.alt} />
              <span className="text-lg font-semibold">{logo.title}</span>
            </NavAnchor>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Menu">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>
                    <NavAnchor
                      href={logo.url}
                      className="flex items-center gap-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                      <img src={logo.src} className="w-8" alt={logo.alt} />
                      <span className="text-lg font-semibold">
                        {logo.title}
                      </span>
                    </NavAnchor>
                  </SheetTitle>
                </SheetHeader>
                <div className="my-6 flex flex-col gap-6">
                  <Accordion
                    type="single"
                    collapsible
                    className="flex w-full flex-col gap-4"
                  >
                    {menu.map((item) => renderMobileMenuItem(item))}
                  </Accordion>
                  {mobileExtraLinks.length > 0 && (
                    <div className="border-t py-4">
                      <div className="grid grid-cols-2 justify-start">
                        {mobileExtraLinks.map((link, idx) => (
                          <SheetClose asChild key={idx}>
                            <NavAnchor
                              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-accent-foreground"
                              href={link.url}
                            >
                              {link.name}
                            </NavAnchor>
                          </SheetClose>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {extraAction && (
                      <SheetClose asChild>
                        <Button asChild variant="outline">
                          <NavAnchor
                            href={extraAction.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2"
                          >
                            {extraAction.icon}
                            {extraAction.label}
                          </NavAnchor>
                        </Button>
                      </SheetClose>
                    )}
                    <SheetClose asChild>
                      <Button asChild variant="outline">
                        <NavAnchor href={auth.login.url}>
                          {auth.login.text}
                        </NavAnchor>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild>
                        <NavAnchor href={auth.signup.url}>
                          {auth.signup.text}
                        </NavAnchor>
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </section>
  );
};

const renderMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <NavigationMenuItem key={item.title} className="text-muted-foreground">
        <NavigationMenuTrigger className="bg-transparent">
          {item.title}
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="w-80 p-3">
            {item.items.map((subItem) => (
              <li key={subItem.title}>
                <NavigationMenuLink asChild>
                  <NavAnchor
                    className="flex select-none gap-4 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-muted hover:text-accent-foreground"
                    href={subItem.url}
                  >
                    {subItem.icon}
                    <div>
                      <div className="text-sm font-semibold">
                        {subItem.title}
                      </div>
                      {subItem.description && (
                        <p className="text-sm leading-snug text-muted-foreground">
                          {subItem.description}
                        </p>
                      )}
                    </div>
                  </NavAnchor>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }

  return (
    <NavAnchor
      key={item.title}
      className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      href={item.url}
    >
      {item.title}
    </NavAnchor>
  );
};

const renderMobileMenuItem = (item: MenuItem) => {
  if (item.items) {
    return (
      <AccordionItem key={item.title} value={item.title} className="border-b-0">
        <AccordionTrigger className="py-0 font-semibold hover:no-underline">
          {item.title}
        </AccordionTrigger>
        <AccordionContent className="mt-2">
          {item.items.map((subItem) => (
            <SheetClose asChild key={subItem.title}>
              <NavAnchor
                className="flex select-none gap-4 rounded-md p-3 leading-none outline-none transition-colors hover:bg-muted hover:text-accent-foreground"
                href={subItem.url}
              >
                {subItem.icon}
                <div>
                  <div className="text-sm font-semibold">{subItem.title}</div>
                  {subItem.description && (
                    <p className="text-sm leading-snug text-muted-foreground">
                      {subItem.description}
                    </p>
                  )}
                </div>
              </NavAnchor>
            </SheetClose>
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <SheetClose asChild key={item.title}>
      <NavAnchor href={item.url} className="font-semibold">
        {item.title}
      </NavAnchor>
    </SheetClose>
  );
};

export { Navbar1, type MenuItem, type Navbar1Props };
