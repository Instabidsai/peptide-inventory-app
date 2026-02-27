import { useRef, useEffect, useState } from 'react';
import {
  StripeLogo, ShopifyLogo, SquareLogo, GmailLogo, SlackLogo,
  DiscordLogo, ZoomLogo, GoogleSheetsLogo, GoogleDriveLogo,
  NotionLogo, AirtableLogo, HubSpotLogo, MailchimpLogo,
  CalendlyLogo, QuickBooksLogo, XeroLogo, TrelloLogo,
  AsanaLogo, ZendeskLogo, IntercomLogo, WooCommerceLogo,
} from '@/components/ui/brand-logos';

const LOGOS = [
  { Component: StripeLogo, name: 'Stripe' },
  { Component: ShopifyLogo, name: 'Shopify' },
  { Component: SquareLogo, name: 'Square' },
  { Component: GmailLogo, name: 'Gmail' },
  { Component: SlackLogo, name: 'Slack' },
  { Component: DiscordLogo, name: 'Discord' },
  { Component: ZoomLogo, name: 'Zoom' },
  { Component: GoogleSheetsLogo, name: 'Sheets' },
  { Component: GoogleDriveLogo, name: 'Drive' },
  { Component: NotionLogo, name: 'Notion' },
  { Component: AirtableLogo, name: 'Airtable' },
  { Component: HubSpotLogo, name: 'HubSpot' },
  { Component: MailchimpLogo, name: 'Mailchimp' },
  { Component: CalendlyLogo, name: 'Calendly' },
  { Component: QuickBooksLogo, name: 'QuickBooks' },
  { Component: XeroLogo, name: 'Xero' },
  { Component: TrelloLogo, name: 'Trello' },
  { Component: AsanaLogo, name: 'Asana' },
  { Component: ZendeskLogo, name: 'Zendesk' },
  { Component: IntercomLogo, name: 'Intercom' },
  { Component: WooCommerceLogo, name: 'WooCommerce' },
];

function LogoItem({ Component, name }: { Component: React.FC<{ className?: string }>; name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 shrink-0">
      <div className="h-12 w-12 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-center transition-colors hover:bg-muted/60 hover:border-border/60">
        <Component className="h-6 w-6" />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground/60 whitespace-nowrap">{name}</span>
    </div>
  );
}

export function IntegrationsBanner() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf: number;
    let pos = 0;
    const speed = 0.5; // px per frame

    function step() {
      if (!paused) {
        pos += speed;
        // Each logo set is half the scroll width (we duplicate for seamless loop)
        const half = el!.scrollWidth / 2;
        if (pos >= half) pos = 0;
        el!.style.transform = `translateX(-${pos}px)`;
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  // Duplicate the logo set for seamless infinite scroll
  const allLogos = [...LOGOS, ...LOGOS];

  return (
    <section className="py-16 md:py-20 overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 text-center mb-10">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary/80 mb-3">
          Seamless Integrations
        </p>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3">
          One-Click Connect to 20+ Services
        </h2>
        <p className="text-muted-foreground/70 max-w-xl mx-auto text-sm md:text-base">
          Payments, email, CRM, accounting, project management — connect everything your business runs on in seconds.
        </p>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10 bg-gradient-to-l from-background to-transparent" />

        <div ref={scrollRef} className="flex will-change-transform" style={{ width: 'max-content' }}>
          {allLogos.map((logo, i) => (
            <LogoItem key={`${logo.name}-${i}`} Component={logo.Component} name={logo.name} />
          ))}
        </div>
      </div>
    </section>
  );
}
